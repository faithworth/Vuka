/**
 * VUKA — Reels (short-form vertical video)
 * Engagement (likes/saves/reposts/comments) piggybacks on the existing
 * generic EngagementEvent + PostComment.targetType/targetId machinery in
 * social.ts, so no separate join tables were needed for those.
 */

import prisma from './prisma';

const MAX_CAPTION_LEN = 500;

export interface CreateReelInput {
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
}

export async function createReel(artistId: string, input: CreateReelInput) {
  if (!input.videoUrl) throw new Error('videoUrl required');
  return prisma.reel.create({
    data: {
      artistId,
      videoUrl: input.videoUrl,
      thumbnailUrl: input.thumbnailUrl ?? '',
      caption: (input.caption ?? '').slice(0, MAX_CAPTION_LEN),
    },
    include: {
      artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true } },
    },
  });
}

const reelInclude = {
  artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true, userId: true } },
} as const;

export async function getReelsFeed(
  userId: string,
  tab: 'following' | 'discover',
  cursor?: string,
  limit = 10
) {
  const take = Math.min(limit, 20);
  const dateFilter = cursor ? { lt: new Date(cursor) } : { lte: new Date() };

  let artistIds: string[] | null = null;
  if (tab === 'following') {
    const follows = await prisma.follow.findMany({ where: { userId }, select: { artistId: true } });
    const ids = follows.map((f) => f.artistId);
    if (ids.length === 0) return { items: [], nextCursor: null, isEmpty: true };
    artistIds = ids;
  }

  const reels = await prisma.reel.findMany({
    where: {
      isPublished: true,
      publishedAt: dateFilter,
      ...(artistIds ? { artistId: { in: artistIds } } : {}),
    },
    include: reelInclude,
    orderBy: { publishedAt: 'desc' },
    take,
  });

  const items = reels.map((r) => ({
    id: r.id,
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    caption: r.caption,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    publishedAt: r.publishedAt.toISOString(),
    isOwn: r.artist.userId === userId,
    artist: {
      id: r.artist.id, name: r.artist.name, slug: r.artist.slug,
      photoUrl: r.artist.photoUrl, isVerified: r.artist.isVerified,
    },
  }));

  const nextCursor = items.length === take ? items[items.length - 1].publishedAt : null;
  return { items, nextCursor, isEmpty: false };
}

export async function incrementReelView(reelId: string): Promise<void> {
  await prisma.reel.update({ where: { id: reelId }, data: { viewCount: { increment: 1 } } }).catch(() => {});
}

export async function deleteReel(reelId: string, userId: string): Promise<void> {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    select: { artist: { select: { userId: true } } },
  });
  if (!reel) throw new Error('Reel not found');
  if (reel.artist.userId !== userId) throw new Error('Not your reel');
  await prisma.reel.delete({ where: { id: reelId } });
}
