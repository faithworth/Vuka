/**
 * VUKA — Social Engine (Phase 3)
 * Handles: Feed, Likes, Saves, Reposts, Comments, Notification dispatch
 * DO NOT touch auth, payments, transactions, creator economy (Phase 1/2 systems).
 */

import prisma from './prisma';

// ── RATE LIMIT CONSTANTS ──────────────────────────────────────
const RATE_WINDOWS = {
  message_send: { max: 20, windowMs: 60_000 },
  comment_post: { max: 10, windowMs: 60_000 },
  report_submit: { max: 5, windowMs: 300_000 },
  follow: { max: 50, windowMs: 60_000 },
  like: { max: 100, windowMs: 60_000 },
} as const;

// ── FEED ──────────────────────────────────────────────────────

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

/** Get the activity feed for a user (people they follow). Cursor-paginated. */
export async function getUserFeed(
  userId: string,
  cursor?: string,
  limit = 20
): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  // 1. Get followed artist IDs
  const follows = await prisma.follow.findMany({
    where: { userId },
    select: { artistId: true },
  });
  const artistIds = follows.map((f) => f.artistId);
  if (artistIds.length === 0) return { items: [], nextCursor: null };

  const take = Math.min(limit, 50);
  const cursorDate = cursor ? new Date(cursor) : new Date();

  // 2. Fetch posts from followed artists
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
    type: 'post' as const,
    id: p.id,
    artistId: p.artist.id,
    artistName: p.artist.name,
    artistSlug: p.artist.slug,
    artistPhoto: p.artist.photoUrl,
    publishedAt: p.publishedAt,
    payload: {
      body: p.body,
      mediaUrls: p.mediaUrls,
      linkUrl: p.linkUrl,
      linkType: p.linkType,
      linkItemId: p.linkItemId,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      repostCount: p.repostCount,
      isPinned: p.isPinned,
    },
  }));

  const nextCursor =
    items.length === take ? items[items.length - 1].publishedAt.toISOString() : null;

  return { items, nextCursor };
}

/** Get an artist's own post history (public profile). */
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

/** Create an artist post. */
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

  const post = await prisma.artistPost.create({
    data: {
      artistId,
      body: data.body.trim(),
      mediaUrls: data.mediaUrls ?? [],
      linkUrl: data.linkUrl ?? '',
      linkType: data.linkType ?? '',
      linkItemId: data.linkItemId ?? '',
    },
    include: {
      artist: { select: { name: true, slug: true } },
    },
  });

  // Notify followers
  await notifyFollowersOfPost(artistId, post.id, post.body.slice(0, 100));

  // Update search index for artist
  await upsertSearchIndexArtist(artistId);

  return post;
}

/** Delete a post (artist can only delete own). */
export async function deleteArtistPost(postId: string, artistId: string): Promise<void> {
  const post = await prisma.artistPost.findUnique({ where: { id: postId } });
  if (!post || post.artistId !== artistId) throw new Error('Not found');
  await prisma.artistPost.delete({ where: { id: postId } });
}

// ── LIKES ─────────────────────────────────────────────────────

/** Toggle like on a target (beat, release, post, comment). Returns new state. */
export async function toggleLike(
  userId: string,
  targetType: string,
  targetId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const existing = await prisma.engagementEvent.findUnique({
    where: {
      userId_type_targetType_targetId: { userId, type: 'like', targetType, targetId },
    },
  });

  if (existing) {
    await prisma.engagementEvent.delete({ where: { id: existing.id } });
    await updateLikeCount(targetType, targetId, -1);
    return { liked: false, likeCount: await getLikeCount(targetType, targetId) };
  } else {
    await prisma.engagementEvent.create({
      data: { userId, type: 'like', targetType, targetId },
    });
    await updateLikeCount(targetType, targetId, +1);

    // Dispatch notification to content owner
    await dispatchLikeNotification(userId, targetType, targetId);

    return { liked: true, likeCount: await getLikeCount(targetType, targetId) };
  }
}

async function updateLikeCount(targetType: string, targetId: string, delta: number) {
  if (targetType === 'post') {
    await prisma.artistPost.update({
      where: { id: targetId },
      data: { likeCount: { increment: delta } },
    });
  } else if (targetType === 'comment') {
    await prisma.postComment.update({
      where: { id: targetId },
      data: { likeCount: { increment: delta } },
    });
  }
  // beat/release likes tracked via EngagementEvent only (no count column on Beat/Release model)
}

async function getLikeCount(targetType: string, targetId: string): Promise<number> {
  return prisma.engagementEvent.count({
    where: { type: 'like', targetType, targetId },
  });
}

/** Check if a user has liked a set of items. */
export async function getBulkLikeStatus(
  userId: string,
  targetType: string,
  targetIds: string[]
): Promise<Record<string, boolean>> {
  const events = await prisma.engagementEvent.findMany({
    where: { userId, type: 'like', targetType, targetId: { in: targetIds } },
    select: { targetId: true },
  });
  const liked = new Set(events.map((e) => e.targetId));
  return Object.fromEntries(targetIds.map((id) => [id, liked.has(id)]));
}

// ── SAVES ─────────────────────────────────────────────────────

/** Toggle save/bookmark. */
export async function toggleSave(
  userId: string,
  targetType: string,
  targetId: string
): Promise<{ saved: boolean }> {
  const existing = await prisma.engagementEvent.findUnique({
    where: {
      userId_type_targetType_targetId: { userId, type: 'save', targetType, targetId },
    },
  });
  if (existing) {
    await prisma.engagementEvent.delete({ where: { id: existing.id } });
    return { saved: false };
  } else {
    await prisma.engagementEvent.create({
      data: { userId, type: 'save', targetType, targetId },
    });
    return { saved: true };
  }
}

/** Get all saves for a user. */
export async function getUserSaves(
  userId: string,
  targetType?: string,
  page = 1,
  limit = 20
): Promise<{ saves: object[]; total: number; hasMore: boolean }> {
  const where = {
    userId,
    type: 'save' as const,
    ...(targetType ? { targetType } : {}),
  };
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const [saves, total] = await Promise.all([
    prisma.engagementEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.engagementEvent.count({ where }),
  ]);

  return { saves, total, hasMore: skip + saves.length < total };
}

// ── REPOSTS ───────────────────────────────────────────────────

/** Repost content to your followers' feeds (creates EngagementEvent + increments counter). */
export async function repost(
  userId: string,
  targetType: string,
  targetId: string,
  note = ''
): Promise<{ reposted: boolean }> {
  const existing = await prisma.engagementEvent.findUnique({
    where: {
      userId_type_targetType_targetId: { userId, type: 'repost', targetType, targetId },
    },
  });
  if (existing) {
    // Undo repost
    await prisma.engagementEvent.delete({ where: { id: existing.id } });
    if (targetType === 'post') {
      await prisma.artistPost.update({
        where: { id: targetId },
        data: { repostCount: { decrement: 1 } },
      });
    }
    return { reposted: false };
  } else {
    await prisma.engagementEvent.create({
      data: { userId, type: 'repost', targetType, targetId, repostNote: note },
    });
    if (targetType === 'post') {
      await prisma.artistPost.update({
        where: { id: targetId },
        data: { repostCount: { increment: 1 } },
      });
    }
    return { reposted: true };
  }
}

// ── COMMENTS ─────────────────────────────────────────────────

export async function createComment(
  userId: string,
  data: {
    body: string;
    targetType: string; // post, beat, release
    targetId: string;
    postId?: string;
    parentId?: string;
  }
): Promise<object> {
  if (!data.body?.trim()) throw new Error('Comment body is required');
  if (data.body.length > 1000) throw new Error('Comment exceeds 1000 characters');

  const comment = await prisma.postComment.create({
    data: {
      userId,
      body: data.body.trim(),
      targetType: data.targetType,
      targetId: data.targetId,
      postId: data.postId ?? null,
      parentId: data.parentId ?? null,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  // Increment comment count on post if applicable
  if (data.postId) {
    await prisma.artistPost.update({
      where: { id: data.postId },
      data: { commentCount: { increment: 1 } },
    });
  }

  // Notify
  await dispatchCommentNotification(userId, comment.id, data.targetType, data.targetId, data.parentId);

  // Update daily rollup
  if (data.targetType === 'post' && data.postId) {
    const post = await prisma.artistPost.findUnique({ where: { id: data.postId }, select: { artistId: true } });
    if (post) await incrementDailyRollup(post.artistId, 'comments');
  }

  return comment;
}

export async function getComments(
  targetType: string,
  targetId: string,
  page = 1,
  limit = 20
): Promise<{ comments: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const [comments, total] = await Promise.all([
    prisma.postComment.findMany({
      where: { targetType, targetId, parentId: null, isHidden: false },
      include: {
        user: { select: { id: true, name: true } },
        replies: {
          where: { isHidden: false },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.postComment.count({ where: { targetType, targetId, parentId: null, isHidden: false } }),
  ]);

  return { comments, total, hasMore: skip + comments.length < total };
}

export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const comment = await prisma.postComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.userId !== userId) throw new Error('Not found or not authorized');
  await prisma.postComment.update({ where: { id: commentId }, data: { isHidden: true } });
  if (comment.postId) {
    await prisma.artistPost.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    });
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────

export interface CreateNotificationInput {
  userId: string;
  type: string;
  actorId?: string;
  actorName?: string;
  actorPhoto?: string;
  targetType?: string;
  targetId?: string;
  targetSlug?: string;
  targetTitle?: string;
  title: string;
  body?: string;
  actionUrl?: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  // Check preferences before inserting
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: input.userId },
  });

  // Type-based in-app preference gating
  if (prefs) {
    const map: Record<string, keyof typeof prefs> = {
      follow: 'inAppFollows',
      like_post: 'inAppLikes',
      like_beat: 'inAppLikes',
      like_release: 'inAppLikes',
      comment: 'inAppComments',
      comment_reply: 'inAppComments',
      message_received: 'inAppMessages',
      purchase_received: 'inAppPurchases',
      new_release: 'inAppReleases',
      new_beat: 'inAppReleases',
      new_post: 'inAppReleases',
      milestone_followers: 'inAppMilestones',
      milestone_sales: 'inAppMilestones',
      moderation_warning: 'inAppModeration',
    };
    const prefKey = map[input.type];
    if (prefKey && prefs[prefKey] === false) return;
  }

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      actorId: input.actorId,
      actorName: input.actorName ?? '',
      actorPhoto: input.actorPhoto ?? '',
      targetType: input.targetType ?? '',
      targetId: input.targetId ?? '',
      targetSlug: input.targetSlug ?? '',
      targetTitle: input.targetTitle ?? '',
      title: input.title,
      body: input.body ?? '',
      actionUrl: input.actionUrl ?? '',
    },
  });
}

export async function getNotifications(
  userId: string,
  page = 1,
  limit = 30,
  unreadOnly = false
): Promise<{ notifications: object[]; unreadCount: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);
  const where = { userId, ...(unreadOnly ? { isRead: false } : {}) };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { notifications, unreadCount, hasMore: skip + notifications.length < take + skip };
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  const where = ids?.length ? { userId, id: { in: ids } } : { userId };
  await prisma.notification.updateMany({ where, data: { isRead: true, readAt: new Date() } });
}

// ── NOTIFICATION DISPATCH HELPERS ────────────────────────────

export async function notifyFollowersOfPost(artistId: string, postId: string, preview: string) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { name: true, slug: true, photoUrl: true, followers: { select: { userId: true } } },
  });
  if (!artist) return;

  // Fan-out: create notification per follower (batch if many)
  const followerIds = artist.followers.map((f) => f.userId);
  if (followerIds.length === 0) return;

  const notifications = followerIds.map((userId) => ({
    userId,
    type: 'new_post',
    actorName: artist.name,
    actorPhoto: artist.photoUrl,
    targetType: 'post',
    targetId: postId,
    targetSlug: artist.slug,
    title: `${artist.name} posted an update`,
    body: preview,
    actionUrl: `/artist/${artist.slug}`,
  }));

  // Insert in chunks of 500 to avoid large payloads
  for (let i = 0; i < notifications.length; i += 500) {
    await prisma.notification.createMany({ data: notifications.slice(i, i + 500) });
  }
}

export async function notifyFollowersOfRelease(
  artistId: string,
  releaseType: 'beat' | 'release',
  itemId: string,
  itemTitle: string,
  itemSlug: string
) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { name: true, slug: true, photoUrl: true, followers: { select: { userId: true } } },
  });
  if (!artist) return;

  const followerIds = artist.followers.map((f) => f.userId);
  if (!followerIds.length) return;

  const type = releaseType === 'beat' ? 'new_beat' : 'new_release';
  const notifications = followerIds.map((userId) => ({
    userId,
    type,
    actorName: artist.name,
    actorPhoto: artist.photoUrl,
    targetType: releaseType,
    targetId: itemId,
    targetSlug: itemSlug,
    targetTitle: itemTitle,
    title: `${artist.name} dropped a new ${releaseType === 'beat' ? 'beat' : 'release'}`,
    body: itemTitle,
    actionUrl: `/${releaseType}/${itemSlug}`,
  }));

  for (let i = 0; i < notifications.length; i += 500) {
    await prisma.notification.createMany({ data: notifications.slice(i, i + 500) });
  }
}

async function dispatchLikeNotification(actorUserId: string, targetType: string, targetId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { name: true },
  });
  if (!actor) return;

  let ownerId: string | null = null;
  let targetTitle = '';
  let targetSlug = '';
  let actionUrl = '';

  if (targetType === 'post') {
    const post = await prisma.artistPost.findUnique({
      where: { id: targetId },
      include: { artist: { select: { userId: true, slug: true } } },
    });
    if (post) {
      ownerId = post.artist.userId;
      targetTitle = post.body.slice(0, 60);
      actionUrl = `/artist/${post.artist.slug}`;
    }
  } else if (targetType === 'beat') {
    const beat = await prisma.beat.findUnique({
      where: { id: targetId },
      include: { artist: { select: { userId: true, slug: true } } },
    });
    if (beat) {
      ownerId = beat.artist.userId;
      targetTitle = beat.title;
      targetSlug = beat.slug;
      actionUrl = `/beat/${beat.slug}`;
    }
  } else if (targetType === 'release') {
    const release = await prisma.release.findUnique({
      where: { id: targetId },
      include: { artist: { select: { userId: true, slug: true } } },
    });
    if (release) {
      ownerId = release.artist.userId;
      targetTitle = release.title;
      targetSlug = release.slug;
      actionUrl = `/release/${release.slug}`;
    }
  }

  if (!ownerId || ownerId === actorUserId) return;

  await createNotification({
    userId: ownerId,
    type: `like_${targetType}`,
    actorId: actorUserId,
    actorName: actor.name,
    targetType,
    targetId,
    targetTitle,
    targetSlug,
    title: `${actor.name} liked your ${targetType}`,
    body: targetTitle,
    actionUrl,
  });
}

async function dispatchCommentNotification(
  actorUserId: string,
  commentId: string,
  targetType: string,
  targetId: string,
  parentId?: string
) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { name: true } });
  if (!actor) return;

  // If this is a reply, notify the parent comment author
  if (parentId) {
    const parent = await prisma.postComment.findUnique({ where: { id: parentId }, select: { userId: true } });
    if (parent && parent.userId !== actorUserId) {
      await createNotification({
        userId: parent.userId,
        type: 'comment_reply',
        actorId: actorUserId,
        actorName: actor.name,
        targetType: 'comment',
        targetId: commentId,
        title: `${actor.name} replied to your comment`,
        actionUrl: `/${targetType}/${targetId}`,
      });
    }
  }

  // Notify content owner
  let ownerId: string | null = null;
  let actionUrl = `/${targetType}/${targetId}`;

  if (targetType === 'post') {
    const post = await prisma.artistPost.findUnique({
      where: { id: targetId },
      include: { artist: { select: { userId: true, slug: true } } },
    });
    if (post) {
      ownerId = post.artist.userId;
      actionUrl = `/artist/${post.artist.slug}`;
    }
  } else if (targetType === 'beat') {
    const beat = await prisma.beat.findUnique({
      where: { id: targetId },
      include: { artist: { select: { userId: true } } },
    });
    if (beat) ownerId = beat.artist.userId;
  } else if (targetType === 'release') {
    const release = await prisma.release.findUnique({
      where: { id: targetId },
      include: { artist: { select: { userId: true } } },
    });
    if (release) ownerId = release.artist.userId;
  }

  if (ownerId && ownerId !== actorUserId) {
    await createNotification({
      userId: ownerId,
      type: 'comment',
      actorId: actorUserId,
      actorName: actor.name,
      targetType,
      targetId,
      title: `${actor.name} commented on your ${targetType}`,
      actionUrl,
    });
  }
}

// ── FOLLOW (extended — adds notification dispatch) ────────────

export async function toggleFollow(
  userId: string,
  artistId: string
): Promise<{ following: boolean; followerCount: number }> {
  const existing = await prisma.follow.findUnique({
    where: { userId_artistId: { userId, artistId } },
  });

  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { userId: true, name: true, slug: true, photoUrl: true },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    await incrementDailyRollup(artistId, 'lostFollowers');
  } else {
    await prisma.follow.create({ data: { userId, artistId } });
    await incrementDailyRollup(artistId, 'newFollowers');

    // Notify artist
    if (artist && artist.userId !== userId) {
      const follower = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      if (follower) {
        await createNotification({
          userId: artist.userId,
          type: 'follow',
          actorId: userId,
          actorName: follower.name,
          targetType: 'artist',
          targetId: artistId,
          targetSlug: artist.slug,
          title: `${follower.name} started following you`,
          actionUrl: `/artist/${artist.slug}`,
        });
      }
    }

    // Milestone checks
    await checkFollowerMilestone(artistId);
  }

  const followerCount = await prisma.follow.count({ where: { artistId } });
  return { following: !existing, followerCount };
}

const FOLLOWER_MILESTONES = [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000];

async function checkFollowerMilestone(artistId: string) {
  const count = await prisma.follow.count({ where: { artistId } });
  const hit = FOLLOWER_MILESTONES.find((m) => count === m);
  if (!hit) return;

  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { userId: true, name: true, slug: true },
  });
  if (!artist) return;

  await createNotification({
    userId: artist.userId,
    type: 'milestone_followers',
    targetType: 'artist',
    targetId: artistId,
    targetSlug: artist.slug,
    title: `🎉 You hit ${hit.toLocaleString()} followers!`,
    body: `${artist.name} now has ${hit.toLocaleString()} followers on Vuka.`,
    actionUrl: `/artist/${artist.slug}`,
  });
}

// ── ANALYTICS ROLLUP HELPER ───────────────────────────────────

export async function incrementDailyRollup(
  artistId: string,
  field: keyof {
    profileViews: number; storeViews: number; beatPlays: number; releasePlays: number;
    videoPlays: number; beatSales: number; releaseSales: number; videoSales: number;
    newFollowers: number; lostFollowers: number; likes: number; comments: number;
    reposts: number; shares: number; newMessages: number; newInquiries: number;
  },
  amount = 1
) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await prisma.analyticsDailyRollup.upsert({
    where: { artistId_date: { artistId, date } },
    create: { artistId, date, [field]: amount },
    update: { [field]: { increment: amount } },
  });
}

// ── SEARCH INDEX MAINTENANCE ──────────────────────────────────

export async function upsertSearchIndexArtist(artistId: string) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: {
      id: true, name: true, slug: true, photoUrl: true, genreTags: true,
      city: true, country: true, totalPlays: true, isPublic: true,
      _count: { select: { beats: true, releases: true, followers: true } },
    },
  });
  if (!artist || !artist.isPublic) return;

  const score = artist.totalPlays * 0.1 + artist._count.followers * 5 +
    artist._count.beats * 2 + artist._count.releases * 2;

  await prisma.searchIndex.upsert({
    where: { entityType_entityId: { entityType: 'artist', entityId: artistId } },
    create: {
      entityType: 'artist', entityId: artistId,
      title: artist.name, subtitle: artist.city,
      tags: artist.genreTags, genre: artist.genreTags[0] ?? '',
      imageUrl: artist.photoUrl, slug: artist.slug,
      score, isActive: artist.isPublic,
    },
    update: {
      title: artist.name, subtitle: artist.city,
      tags: artist.genreTags, genre: artist.genreTags[0] ?? '',
      imageUrl: artist.photoUrl, slug: artist.slug,
      score, isActive: artist.isPublic,
    },
  });
}

export async function upsertSearchIndexBeat(beatId: string) {
  const beat = await prisma.beat.findUnique({
    where: { id: beatId },
    include: { artist: { select: { name: true } } },
  });
  if (!beat || !beat.isActive) {
    await prisma.searchIndex.deleteMany({ where: { entityType: 'beat', entityId: beatId } });
    return;
  }

  const score = beat.plays * 0.1 + beat.sales * 10;

  await prisma.searchIndex.upsert({
    where: { entityType_entityId: { entityType: 'beat', entityId: beatId } },
    create: {
      entityType: 'beat', entityId: beatId,
      title: beat.title, subtitle: beat.artist.name,
      tags: beat.tags, genre: beat.genre,
      imageUrl: beat.artworkUrl, slug: beat.slug,
      score, isActive: beat.isActive,
    },
    update: {
      title: beat.title, subtitle: beat.artist.name,
      tags: beat.tags, genre: beat.genre,
      imageUrl: beat.artworkUrl, slug: beat.slug,
      score, isActive: beat.isActive,
    },
  });
}
