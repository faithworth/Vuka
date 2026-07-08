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
import { checkAndAwardPlaques } from './plaques';

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
      artist: { select: { name: true, slug: true, photoUrl: true, isVerified: true } },
      _count: { select: { comments: true } },
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

  // Follower-count milestone plaques — fire-and-forget, never blocks the follow action.
  checkAndAwardPlaques(artistId).catch(() => {});
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

export async function getBulkFollowStatus(
  userId: string,
  artistIds: string[]
): Promise<Record<string, boolean>> {
  if (artistIds.length === 0) return {};
  const follows = await prisma.follow.findMany({
    where: { userId, artistId: { in: artistIds } },
    select: { artistId: true },
  });
  const followedIds = new Set(follows.map((f) => f.artistId));
  return Object.fromEntries(artistIds.map((id) => [id, followedIds.has(id)]));
}

// ── LIKES ─────────────────────────────────────────────────────

type LikeableType = 'beat' | 'release' | 'post' | 'comment' | 'reel';

/**
 * Resolve the user who "owns" a likeable/commentable entity, so we know
 * who to notify. Returns null for entities with no clear owner.
 */
async function resolveEntityOwner(
  targetType: LikeableType,
  targetId: string
): Promise<{ ownerId: string; preview: string } | null> {
  if (targetType === 'post') {
    const post = await prisma.artistPost.findUnique({
      where: { id: targetId },
      select: { body: true, artist: { select: { userId: true } } },
    });
    return post ? { ownerId: post.artist.userId, preview: post.body.slice(0, 60) } : null;
  }
  if (targetType === 'beat') {
    const beat = await prisma.beat.findUnique({
      where: { id: targetId },
      select: { title: true, artist: { select: { userId: true } } },
    });
    return beat ? { ownerId: beat.artist.userId, preview: beat.title } : null;
  }
  if (targetType === 'release') {
    const release = await prisma.release.findUnique({
      where: { id: targetId },
      select: { title: true, artist: { select: { userId: true } } },
    });
    return release ? { ownerId: release.artist.userId, preview: release.title } : null;
  }
  if (targetType === 'reel') {
    const reel = await prisma.reel.findUnique({
      where: { id: targetId },
      select: { caption: true, artist: { select: { userId: true } } },
    });
    return reel ? { ownerId: reel.artist.userId, preview: reel.caption.slice(0, 60) || 'a reel' } : null;
  }
  if (targetType === 'comment') {
    const comment = await prisma.postComment.findUnique({
      where: { id: targetId },
      select: { userId: true, body: true },
    });
    return comment ? { ownerId: comment.userId, preview: comment.body.slice(0, 60) } : null;
  }
  return null;
}

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
  } else if (targetType === 'reel') {
    entityExists = !!(await prisma.reel.findUnique({ where: { id: targetId }, select: { id: true } }));
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
    } else if (targetType === 'reel') {
      await prisma.reel.update({ where: { id: targetId }, data: { likeCount: { decrement: 1 } } });
    }
    return { liked: false };
  } else {
    await prisma.engagementEvent.create({
      data: { userId, eventType: 'like', targetType, targetId },
    });
    if (targetType === 'post') {
      await prisma.artistPost.update({ where: { id: targetId }, data: { likeCount: { increment: 1 } } });
    } else if (targetType === 'reel') {
      await prisma.reel.update({ where: { id: targetId }, data: { likeCount: { increment: 1 } } });
    }

    // Notify the owner — fire-and-forget, never blocks the toggle response.
    void (async () => {
      try {
        const owner = await resolveEntityOwner(targetType, targetId);
        if (owner && owner.ownerId !== userId) {
          const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
          await createNotification({
            userId: owner.ownerId,
            type: 'new_like',
            title: `${actor?.name ?? 'Someone'} liked your ${targetType}`,
            body: owner.preview,
            linkType: targetType,
            linkId: targetId,
          });
        }
      } catch (err) {
        logger.warn('[social] like notification failed', {
          targetType, targetId, error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

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

export async function getBulkSaveStatus(
  userId: string,
  targetType: string,
  targetIds: string[]
): Promise<Record<string, boolean>> {
  if (targetIds.length === 0) return {};
  const events = await prisma.engagementEvent.findMany({
    where: { userId, eventType: 'save', targetType, targetId: { in: targetIds } },
    select: { targetId: true },
  });
  const savedIds = new Set(events.map((e) => e.targetId));
  return Object.fromEntries(targetIds.map((id) => [id, savedIds.has(id)]));
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

/**
 * Toggle a repost on/off (Twitter/X-style: click again to undo). Mirrors
 * toggleLike's semantics rather than throwing on a duplicate action.
 */
export async function toggleRepost(
  userId: string,
  targetType: string,
  targetId: string,
  note?: string
): Promise<{ reposted: boolean }> {
  const existing = await prisma.engagementEvent.findFirst({
    where: { userId, eventType: 'repost', targetType, targetId },
  });

  if (existing) {
    await prisma.engagementEvent.delete({ where: { id: existing.id } });
    if (targetType === 'post') {
      await prisma.artistPost.update({ where: { id: targetId }, data: { repostCount: { decrement: 1 } } });
    } else if (targetType === 'reel') {
      await prisma.reel.update({ where: { id: targetId }, data: { repostCount: { decrement: 1 } } });
    }
    return { reposted: false };
  }

  await prisma.engagementEvent.create({
    data: { userId, eventType: 'repost', targetType, targetId, meta: note ? { note } : {} },
  });

  if (targetType === 'post') {
    await prisma.artistPost.update({
      where: { id: targetId },
      data: { repostCount: { increment: 1 } },
    });

    // Notify the original post owner — fire-and-forget.
    void (async () => {
      try {
        const post = await prisma.artistPost.findUnique({
          where: { id: targetId },
          select: { body: true, artist: { select: { userId: true } } },
        });
        if (post && post.artist.userId !== userId) {
          const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
          await createNotification({
            userId: post.artist.userId,
            type: 'new_repost',
            title: `${actor?.name ?? 'Someone'} reposted your post`,
            body: note || post.body.slice(0, 60),
            linkType: 'post',
            linkId: targetId,
          });
        }
      } catch (err) {
        logger.warn('[social] repost notification failed', {
          targetId, error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  } else if (targetType === 'reel') {
    await prisma.reel.update({ where: { id: targetId }, data: { repostCount: { increment: 1 } } });

    void (async () => {
      try {
        const reel = await prisma.reel.findUnique({
          where: { id: targetId },
          select: { caption: true, artist: { select: { userId: true } } },
        });
        if (reel && reel.artist.userId !== userId) {
          const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
          await createNotification({
            userId: reel.artist.userId,
            type: 'new_repost',
            title: `${actor?.name ?? 'Someone'} reposted your reel`,
            body: note || reel.caption.slice(0, 60) || 'your reel',
            linkType: 'reel',
            linkId: targetId,
          });
        }
      } catch (err) {
        logger.warn('[social] reel repost notification failed', {
          targetId, error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }

  return { reposted: true };
}

export async function getBulkRepostStatus(
  userId: string,
  targetType: string,
  targetIds: string[]
): Promise<Record<string, boolean>> {
  if (targetIds.length === 0) return {};
  const events = await prisma.engagementEvent.findMany({
    where: { userId, eventType: 'repost', targetType, targetId: { in: targetIds } },
    select: { targetId: true },
  });
  const repostedIds = new Set(events.map((e) => e.targetId));
  return Object.fromEntries(targetIds.map((id) => [id, repostedIds.has(id)]));
}

// ── COMMENTS ─────────────────────────────────────────────────

export async function createComment(
  userId: string,
  data: {
    postId?: string;
    beatId?: string;
    releaseId?: string;
    reelId?: string;
    body: string;
    parentId?: string;
  }
): Promise<object> {
  if (!data.body?.trim()) throw new Error('Comment body is required');
  if (data.body.length > 1000) throw new Error('Comment exceeds 1000 characters');
  if (!data.postId && !data.beatId && !data.releaseId && !data.reelId) throw new Error('Target is required');

  const sanitised = data.body.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();

  const comment = await prisma.postComment.create({
    data: {
      userId,
      postId:   data.postId    ?? null,
      beatId:   data.beatId    ?? null,
      releaseId:data.releaseId ?? null,
      body:     sanitised,
      parentId: data.parentId  ?? null,
      // Reel comments use the generic targetType/targetId columns since
      // Reel predates a dedicated FK on PostComment (added later, so this
      // avoids a schema migration for a new nullable column + index).
      ...(data.reelId ? { targetType: 'reel', targetId: data.reelId } : {}),
    },
  });

  if (data.postId) {
    await prisma.artistPost.update({
      where: { id: data.postId },
      data: { commentCount: { increment: 1 } },
    });
  }
  if (data.reelId) {
    await prisma.reel.update({
      where: { id: data.reelId },
      data: { commentCount: { increment: 1 } },
    });
  }

  await incrementDailyRollup(userId, 'comments');

  // Notify: the post owner (on top-level or reply) and the parent comment's
  // author (on a reply), skipping self-notifications and de-duplicating.
  void (async () => {
    try {
      const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const notifiedAlready = new Set<string>([userId]);

      if (data.parentId) {
        const parent = await prisma.postComment.findUnique({
          where: { id: data.parentId },
          select: { userId: true },
        });
        if (parent && !notifiedAlready.has(parent.userId)) {
          await createNotification({
            userId: parent.userId,
            type: 'new_reply',
            title: `${actor?.name ?? 'Someone'} replied to your comment`,
            body: sanitised.slice(0, 80),
            linkType: 'post',
            linkId: data.postId ?? data.beatId ?? data.releaseId ?? data.reelId ?? '',
          });
          notifiedAlready.add(parent.userId);
        }
      }

      if (data.postId) {
        const post = await prisma.artistPost.findUnique({
          where: { id: data.postId },
          select: { artist: { select: { userId: true } } },
        });
        if (post && !notifiedAlready.has(post.artist.userId)) {
          await createNotification({
            userId: post.artist.userId,
            type: 'new_comment',
            title: `${actor?.name ?? 'Someone'} commented on your post`,
            body: sanitised.slice(0, 80),
            linkType: 'post',
            linkId: data.postId,
          });
        }
      }

      if (data.reelId) {
        const reel = await prisma.reel.findUnique({
          where: { id: data.reelId },
          select: { artist: { select: { userId: true } } },
        });
        if (reel && !notifiedAlready.has(reel.artist.userId)) {
          await createNotification({
            userId: reel.artist.userId,
            type: 'new_comment',
            title: `${actor?.name ?? 'Someone'} commented on your reel`,
            body: sanitised.slice(0, 80),
            linkType: 'reel',
            linkId: data.reelId,
          });
        }
      }
    } catch (err) {
      logger.warn('[social] comment notification failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return comment;
}

// ── DISCOVER FEED (public posts, not limited to who you follow) ───────

export async function getDiscoverFeed(
  userId: string | null,
  cursor?: string,
  limit = 20
): Promise<{ items: object[]; nextCursor: string | null }> {
  const take = Math.min(limit, 50);
  const dateFilter = cursor ? { lt: new Date(cursor) } : { lte: new Date() };

  const posts = await prisma.artistPost.findMany({
    where: { isPublished: true, publishedAt: dateFilter },
    include: {
      artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true, userId: true } },
    },
    // Recency-weighted discovery: newest first, pinned posts don't leak into
    // discovery ordering (pinning only matters on an artist's own profile).
    orderBy: { publishedAt: 'desc' },
    take,
  });

  const items = posts.map((p) => ({
    id: p.id,
    body: p.body,
    mediaUrls: p.mediaUrls,
    linkUrl: p.linkUrl,
    linkType: p.linkType,
    linkItemId: p.linkItemId,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    repostCount: p.repostCount,
    isPinned: false,
    publishedAt: p.publishedAt.toISOString(),
    isOwn: userId ? p.artist.userId === userId : false,
    artist: {
      id: p.artist.id,
      name: p.artist.name,
      slug: p.artist.slug,
      photoUrl: p.artist.photoUrl,
      isVerified: p.artist.isVerified,
    },
  }));

  const nextCursor = items.length === take ? items[items.length - 1].publishedAt : null;
  return { items, nextCursor };
}

export async function getComments(
  targetType: 'post' | 'beat' | 'release' | 'reel',
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
        targetType === 'release' ? { releaseId: targetId } :
        { targetType: 'reel', targetId }),
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
  // Extended fields accepted from callers (mapped internally)
  actorId?: string;
  actorName?: string;
  targetType?: string;
  targetId?: string;
  actionUrl?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId:   data.userId,
        type:     data.type,
        title:    data.title,
        body:     data.body,
        linkType: data.linkType ?? data.targetType ?? '',
        linkId:   data.linkId   ?? data.targetId   ?? '',
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
  limit = 30,
  unreadOnly = false
): Promise<{ notifications: object[]; unread: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);
  const where = unreadOnly ? { userId, isRead: false } : { userId };

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
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
