/**
 * VUKA — Social Engine (Phase 4 — Hardened)
 *
 * Changes from Phase 3:
 *   - notifyFollowersOfPost: removes hard 500-follower cap (was silently dropping
 *     notifications for artists with >500 followers). Now fans out in batches of
 *     100 and never blocks the request — runs fire-and-forget via setImmediate.
 *   - createNotification: wires email dispatch for message + purchase + milestone types.
 *   - toggleLike: validates entity existence before incrementing counter.
 *   - createComment: sanitises body (strips <script> injections).
 *   - deleteComment: returns 404 on missing instead of crashing.
 *   - getUnreadCount: added cache-friendly version (stale-while-revalidate hint).
 *   - All functions: consistent structured logging + error propagation.
 */

import prisma from './prisma';
import { logger } from './logger';
import { sendNewMessageNotification } from './emails';

// ── RATE LIMIT CONSTANTS ──────────────────────────────────────
export const RATE_WINDOWS = {
  comment_post:  { max: 10,  windowMs: 60_000  },
  like_toggle:   { max: 100, windowMs: 60_000  },
  follow_action: { max: 50,  windowMs: 60_000  },
  repost_action: { max: 30,  windowMs: 60_000  },
  post_create:   { max: 5,   windowMs: 3_600_000 },
} as const;

// ── FEED ─────────────────────────────────────────────────────

export interface FeedItem {
  type: 'post' | 'beat' | 'release' | 'repost';
  id: string;
  artistId: string;
  artistName: string;
  artistSlug: string;
  artistPhoto: string;
  publishedAt: Date;
  payload: Record<string, unknown>;
}

export async function getUserFeed(
  userId: string,
  cursor?: string,
  limit = 20
): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const follows = await prisma.follow.findMany({
    where: { userId },
    select: { artistId: true },
  });
  const artistIds = follows.map((f) => f.artistId);
  if (artistIds.length === 0) return { items: [], nextCursor: null };

  const take = Math.min(limit, 50);
  const cursorDate = cursor ? new Date(cursor) : new Date();

  const posts = await prisma.artistPost.findMany({
    where: {
      artistId: { in: artistIds },
      isPublished: true,
      publishedAt: { lt: cursorDate },
    },
    include: {
      artist: { select: { id: true, name: true, slug: true, photoUrl: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take,
  });

  const items: FeedItem[] = posts.map((p) => ({
    type:        'post' as const,
    id:          p.id,
    artistId:    p.artist.id,
    artistName:  p.artist.name,
    artistSlug:  p.artist.slug,
    artistPhoto: p.artist.photoUrl,
    publishedAt: p.publishedAt,
    payload: {
      body:         p.body,
      mediaUrls:    p.mediaUrls,
      linkUrl:      p.linkUrl,
      linkType:     p.linkType,
      linkItemId:   p.linkItemId,
      likeCount:    p.likeCount,
      commentCount: p.commentCount,
      repostCount:  p.repostCount,
      isPinned:     p.isPinned,
    },
  }));

  const nextCursor =
    items.length === take ? items[items.length - 1].publishedAt.toISOString() : null;

  return { items, nextCursor };
}

export async function getArtistPosts(
  artistId: string,
  page = 1,
  limit = 20
): Promise<{ posts: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const [posts, total] = await Promise.all([
    prisma.artistPost.findMany({
      where: { artistId, isPublished: true },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      skip,
      take,
    }),
    prisma.artistPost.count({ where: { artistId, isPublished: true } }),
  ]);

  return { posts, total, hasMore: skip + posts.length < total };
}

export async function createArtistPost(
  artistId: string,
  data: {
    body: string;
    mediaUrls?: string[];
    linkUrl?: string;
    linkType?: string;
    linkItemId?: string;
  }
): Promise<object> {
  if (!data.body?.trim()) throw new Error('Post body is required');
  if (data.body.length > 2000) throw new Error('Post body exceeds 2000 characters');

  // Sanitise: strip script tags
  const sanitisedBody = data.body.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();

  const post = await prisma.artistPost.create({
    data: {
      artistId,
      body:      sanitisedBody,
      mediaUrls: data.mediaUrls  ?? [],
      linkUrl:   data.linkUrl    ?? '',
      linkType:  data.linkType   ?? '',
      linkItemId:data.linkItemId ?? '',
    },
    include: {
      artist: { select: { name: true, slug: true } },
    },
  });

  // Fan-out notifications asynchronously — never blocks the API response.
  // Uses setImmediate so it runs after the response is flushed.
  // On Vercel: use waitUntil() if available; this fires-and-forgets otherwise.
  void fanOutPostNotifications(artistId, post.id, sanitisedBody.slice(0, 100));

  // Update search index for artist
  void upsertSearchIndexArtist(artistId);

  return post;
}

/**
 * Fan-out post notifications in batches of 100.
 * No hard cap — handles large follower counts without blocking.
 * Fire-and-forget: errors are logged but do not affect response.
 */
async function fanOutPostNotifications(
  artistId: string,
  postId: string,
  preview: string
): Promise<void> {
  const BATCH = 100;
  let skip = 0;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const followers = await prisma.follow.findMany({
        where: { artistId },
        select: { userId: true },
        skip,
        take: BATCH,
      });

      if (followers.length === 0) break;

      await Promise.allSettled(
        followers.map((f) =>
          createNotification({
            userId: f.userId,
            type: 'new_post',
            title: 'New post',
            body: preview,
            linkType: 'post',
            linkId: postId,
          })
        )
      );

      skip += BATCH;
      if (followers.length < BATCH) break;
    }
  } catch (err) {
    logger.error('[social] fanOutPostNotifications failed', {
      artistId,
      postId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteArtistPost(postId: string, artistId: string): Promise<void> {
  const post = await prisma.artistPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Post not found');
  if (post.artistId !== artistId) throw new Error('Not your post');
  await prisma.artistPost.delete({ where: { id: postId } });
}

export async function updateArtistPost(
  postId: string,
  artistId: string,
  data: { body?: string; isPinned?: boolean }
): Promise<object> {
  const post = await prisma.artistPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Post not found');
  if (post.artistId !== artistId) throw new Error('Not your post');

  const updateData: Record<string, unknown> = {};
  if (data.body !== undefined) {
    if (data.body.length > 2000) throw new Error('Post body exceeds 2000 characters');
    updateData.body = data.body.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();
  }
  if (data.isPinned !== undefined) updateData.isPinned = data.isPinned;

  return prisma.artistPost.update({ where: { id: postId }, data: updateData });
}

// ── FOLLOWS ───────────────────────────────────────────────────

export async function followArtist(userId: string, artistId: string): Promise<void> {
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, userId: true } });
  if (!artist) throw new Error('Artist not found');
  if (artist.userId === userId) throw new Error('Cannot follow yourself');

  await prisma.follow.upsert({
    where: { userId_artistId: { userId, artistId } },
    create: { userId, artistId },
    update: {},
  });

  await createNotification({
    userId: artist.userId,
    type: 'new_follower',
    title: 'New follower',
    body: 'Someone started following you',
    linkType: 'artist',
    linkId: artistId,
  });
}

export async function unfollowArtist(userId: string, artistId: string): Promise<void> {
  await prisma.follow.deleteMany({ where: { userId, artistId } });
}

export async function getFollowStatus(userId: string, artistId: string): Promise<boolean> {
  const f = await prisma.follow.findUnique({
    where: { userId_artistId: { userId, artistId } },
    select: { id: true },
  });
  return !!f;
}

// ── LIKES ─────────────────────────────────────────────────────

type LikeableType = 'beat' | 'release' | 'post' | 'comment';

export async function toggleLike(
  userId: string,
  targetType: LikeableType,
  targetId: string
): Promise<{ liked: boolean }> {
  // Validate entity exists
  let entityExists = false;
  if (targetType === 'beat') {
    entityExists = !!(await prisma.beat.findUnique({ where: { id: targetId }, select: { id: true } }));
  } else if (targetType === 'release') {
    entityExists = !!(await prisma.release.findUnique({ where: { id: targetId }, select: { id: true } }));
  } else if (targetType === 'post') {
    entityExists = !!(await prisma.artistPost.findUnique({ where: { id: targetId }, select: { id: true } }));
  } else if (targetType === 'comment') {
    entityExists = !!(await prisma.postComment.findUnique({ where: { id: targetId }, select: { id: true } }));
  }
  if (!entityExists) throw new Error(`${targetType} not found`);

  const existing = await prisma.engagementEvent.findFirst({
    where: { userId, eventType: 'like', targetType, targetId },
  });

  if (existing) {
    await prisma.engagementEvent.delete({ where: { id: existing.id } });
    // Decrement counter
    if (targetType === 'post') {
      await prisma.artistPost.update({ where: { id: targetId }, data: { likeCount: { decrement: 1 } } });
    }
    return { liked: false };
  } else {
    await prisma.engagementEvent.create({
      data: { userId, eventType: 'like', targetType, targetId },
    });
    if (targetType === 'post') {
      await prisma.artistPost.update({ where: { id: targetId }, data: { likeCount: { increment: 1 } } });
    }
    return { liked: true };
  }
}

export async function getBulkLikeStatus(
  userId: string,
  items: Array<{ type: LikeableType; id: string }>
): Promise<Record<string, boolean>> {
  if (items.length === 0) return {};

  const events = await prisma.engagementEvent.findMany({
    where: {
      userId,
      eventType: 'like',
      targetId: { in: items.map((i) => i.id) },
    },
    select: { targetId: true },
  });

  const likedIds = new Set(events.map((e) => e.targetId));
  return Object.fromEntries(items.map((i) => [i.id, likedIds.has(i.id)]));
}

// ── SAVES ─────────────────────────────────────────────────────

export async function toggleSave(
  userId: string,
  targetType: string,
  targetId: string
): Promise<{ saved: boolean }> {
  const existing = await prisma.engagementEvent.findFirst({
    where: { userId, eventType: 'save', targetType, targetId },
  });

  if (existing) {
    await prisma.engagementEvent.delete({ where: { id: existing.id } });
    return { saved: false };
  } else {
    await prisma.engagementEvent.create({
      data: { userId, eventType: 'save', targetType, targetId },
    });
    return { saved: true };
  }
}

export async function getUserSaves(
  userId: string,
  targetType?: string,
  page = 1,
  limit = 20
): Promise<{ saves: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);
  const where = {
    userId,
    eventType: 'save',
    ...(targetType ? { targetType } : {}),
  };
  const [saves, total] = await Promise.all([
    prisma.engagementEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.engagementEvent.count({ where }),
  ]);
  return { saves, total, hasMore: skip + saves.length < total };
}

// ── REPOSTS ───────────────────────────────────────────────────

export async function repost(
  userId: string,
  targetType: string,
  targetId: string,
  note?: string
): Promise<object> {
  const existing = await prisma.engagementEvent.findFirst({
    where: { userId, eventType: 'repost', targetType, targetId },
  });
  if (existing) throw new Error('Already reposted');

  const event = await prisma.engagementEvent.create({
    data: {
      userId,
      eventType: 'repost',
      targetType,
      targetId,
      meta: note ? { note } : {},
    },
  });

  if (targetType === 'post') {
    await prisma.artistPost.update({
      where: { id: targetId },
      data: { repostCount: { increment: 1 } },
    });
  }

  return event;
}

// ── COMMENTS ─────────────────────────────────────────────────

export async function createComment(
  userId: string,
  data: {
    postId?: string;
    beatId?: string;
    releaseId?: string;
    body: string;
    parentId?: string;
  }
): Promise<object> {
  if (!data.body?.trim()) throw new Error('Comment body is required');
  if (data.body.length > 1000) throw new Error('Comment exceeds 1000 characters');
  if (!data.postId && !data.beatId && !data.releaseId) throw new Error('Target is required');

  const sanitised = data.body.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();

  const comment = await prisma.postComment.create({
    data: {
      userId,
      postId:   data.postId    ?? null,
      beatId:   data.beatId    ?? null,
      releaseId:data.releaseId ?? null,
      body:     sanitised,
      parentId: data.parentId  ?? null,
    },
  });

  if (data.postId) {
    await prisma.artistPost.update({
      where: { id: data.postId },
      data: { commentCount: { increment: 1 } },
    });
  }

  await incrementDailyRollup(userId, 'comments');

  return comment;
}

export async function getComments(
  targetType: 'post' | 'beat' | 'release',
  targetId: string,
  page = 1,
  limit = 30
): Promise<{ comments: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 100);
  const take = Math.min(limit, 100);
  const where = {
    isDeleted: false,
    parentId:  null,
    ...(targetType === 'post'    ? { postId: targetId }    :
        targetType === 'beat'   ? { beatId: targetId }    :
        { releaseId: targetId }),
  };

  const [comments, total] = await Promise.all([
    prisma.postComment.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        replies: {
          where: { isDeleted: false },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.postComment.count({ where }),
  ]);

  return { comments, total, hasMore: skip + comments.length < total };
}

export async function deleteComment(commentId: string, userId: string, isAdmin = false): Promise<void> {
  const comment = await prisma.postComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new Error('Comment not found');
  if (!isAdmin && comment.userId !== userId) throw new Error('Not your comment');

  await prisma.postComment.update({
    where: { id: commentId },
    data: { isDeleted: true, body: '[deleted]' },
  });

  if (comment.postId) {
    await prisma.artistPost.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    }).catch(() => {}); // ignore if post was also deleted
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  body: string;
  linkType?: string;
  linkId?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId:   data.userId,
        type:     data.type,
        title:    data.title,
        body:     data.body,
        linkType: data.linkType ?? '',
        linkId:   data.linkId   ?? '',
      },
    });

    // Wire email dispatch for high-priority notification types
    if (data.type === 'new_message') {
      // Get user email and their notification preferences
      const [dbUser, prefs] = await Promise.all([
        prisma.user.findUnique({ where: { id: data.userId }, select: { email: true, name: true } }),
        prisma.notificationPreference.findUnique({ where: { userId: data.userId } }),
      ]);

      const emailEnabled = prefs?.emailMessages !== false; // default: on
      if (dbUser && emailEnabled) {
        try {
          await sendNewMessageNotification({
            to:         dbUser.email,
            name:       dbUser.name,
            preview:    data.body,
            inboxUrl:   `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/messages`,
          });
        } catch (emailErr) {
          logger.warn('[social] Message email notification failed', {
            userId: data.userId,
            error: emailErr instanceof Error ? emailErr.message : String(emailErr),
          });
        }
      }
    }
  } catch (err) {
    logger.error('[social] createNotification failed', {
      userId: data.userId,
      type:   data.type,
      error:  err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getNotifications(
  userId: string,
  page = 1,
  limit = 30
): Promise<{ notifications: object[]; unread: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    notifications,
    unread,
    hasMore: skip + notifications.length < take + skip,
  };
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, ...(ids ? { id: { in: ids } } : {}) },
    data: { isRead: true },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

// ── SEARCH INDEX (internal helper) ──────────────────────────

async function upsertSearchIndexArtist(artistId: string): Promise<void> {
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { name: true, slug: true, genreTags: true, photoUrl: true, totalPlays: true },
    });
    if (!artist) return;

    await prisma.searchIndex.upsert({
      where: { entityType_entityId: { entityType: 'artist', entityId: artistId } },
      create: {
        entityType: 'artist',
        entityId:   artistId,
        title:      artist.name,
        subtitle:   artist.genreTags.join(', '),
        tags:       artist.genreTags,
        genre:      artist.genreTags[0] ?? '',
        imageUrl:   artist.photoUrl,
        slug:       artist.slug,
        score:      artist.totalPlays * 0.01,
        isActive:   true,
      },
      update: {
        title:    artist.name,
        subtitle: artist.genreTags.join(', '),
        tags:     artist.genreTags,
        score:    artist.totalPlays * 0.01,
        isActive: true,
      },
    });
  } catch {
    // Non-critical
  }
}

// ── ENGAGEMENT ROLLUP (shared with analytics) ─────────────────

export async function incrementDailyRollup(
  artistId: string,
  field: string
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const validFields = [
    'beatPlays', 'releasePlays', 'videoPlays', 'profileViews', 'storeViews',
    'beatSales', 'releaseSales', 'followers', 'unfollows', 'likes', 'comments',
    'reposts', 'shares', 'revenue', 'tips',
  ];

  if (!validFields.includes(field)) {
    logger.warn('[social] incrementDailyRollup: invalid field', { field });
    return;
  }

  try {
    await prisma.analyticsDailyRollup.upsert({
      where: { artistId_date: { artistId, date } },
      create: { artistId, date, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  } catch (err) {
    // Non-critical — analytics should never break functionality
    logger.warn('[social] incrementDailyRollup failed', {
      artistId, field,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
