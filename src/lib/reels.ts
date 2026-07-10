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

interface ReelWithArtist {
  id: string; videoUrl: string; thumbnailUrl: string; caption: string;
  likeCount: number; commentCount: number; repostCount: number; viewCount: number;
  publishedAt: Date;
  artist: { id: string; name: string; slug: string; photoUrl: string; isVerified: boolean; userId: string };
}
interface ReposterUser {
  id: string; name: string;
  artist: { slug: string; photoUrl: string; isVerified: boolean } | null;
}

function serializeReel(
  r: ReelWithArtist,
  viewerUserId: string,
  repostedBy?: { id: string; name: string; slug?: string; photoUrl: string; isVerified: boolean }
) {
  return {
    id: r.id,
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    caption: r.caption,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    publishedAt: r.publishedAt.toISOString(),
    isOwn: r.artist.userId === viewerUserId,
    artist: {
      id: r.artist.id, name: r.artist.name, slug: r.artist.slug,
      photoUrl: r.artist.photoUrl, isVerified: r.artist.isVerified,
    },
    repostedBy: repostedBy && repostedBy.id !== viewerUserId ? repostedBy : undefined,
  };
}

export async function getReelsFeed(
  userId: string,
  tab: 'following' | 'discover',
  cursor?: string,
  limit = 10
) {
  const take = Math.min(limit, 20);
  const dateFilter = cursor ? { lt: new Date(cursor) } : { lte: new Date() };

  if (tab === 'discover') {
    const reels = await prisma.reel.findMany({
      where: { isPublished: true, publishedAt: dateFilter },
      include: reelInclude,
      orderBy: { publishedAt: 'desc' },
      take,
    });
    const items = reels.map((r) => serializeReel(r, userId));
    const nextCursor = items.length === take ? items[items.length - 1].publishedAt : null;
    return { items, nextCursor, isEmpty: false };
  }

  // "following" — original reels from artists you follow, plus reels
  // *reposted* by artists you follow (same reshare fix as the posts feed).
  const follows = await prisma.follow.findMany({ where: { userId }, select: { artistId: true } });
  const artistIds = follows.map((f) => f.artistId);
  if (artistIds.length === 0) return { items: [], nextCursor: null, isEmpty: true };

  const followedArtists = await prisma.artist.findMany({ where: { id: { in: artistIds } }, select: { userId: true } });
  const followedUserIds = followedArtists.map((a) => a.userId);

  const [reels, repostEvents] = await Promise.all([
    prisma.reel.findMany({
      where: { artistId: { in: artistIds }, isPublished: true, publishedAt: dateFilter },
      include: reelInclude,
      orderBy: { publishedAt: 'desc' },
      take: take * 2,
    }) as unknown as Promise<ReelWithArtist[]>,
    prisma.engagementEvent.findMany({
      where: { eventType: 'repost', targetType: 'reel', userId: { in: followedUserIds }, createdAt: dateFilter },
      orderBy: { createdAt: 'desc' },
      take: take * 2,
      select: { targetId: true, createdAt: true, userId: true },
    }),
  ]);

  const repostedReelIds = Array.from(new Set(repostEvents.map((e) => e.targetId)));
  const reposterIds = Array.from(new Set(repostEvents.map((e) => e.userId)));
  const [repostedReels, reposters] = await Promise.all([
    prisma.reel.findMany({
      where: { id: { in: repostedReelIds }, isPublished: true }, include: reelInclude,
    }) as unknown as Promise<ReelWithArtist[]>,
    prisma.user.findMany({
      where: { id: { in: reposterIds } },
      select: { id: true, name: true, artist: { select: { slug: true, photoUrl: true, isVerified: true } } },
    }) as unknown as Promise<ReposterUser[]>,
  ]);

  const repostedReelsById = new Map<string, ReelWithArtist>(repostedReels.map((r) => [r.id, r]));
  const reposterById = new Map<string, ReposterUser>(reposters.map((u) => [u.id, u]));

  const merged = new Map<string, { sortDate: Date; item: ReturnType<typeof serializeReel> }>();
  for (const r of reels) merged.set(r.id, { sortDate: r.publishedAt, item: serializeReel(r, userId) });
  for (const e of repostEvents) {
    const reel = repostedReelsById.get(e.targetId);
    if (!reel) continue;
    const reposter = reposterById.get(e.userId);
    const entry = {
      sortDate: e.createdAt,
      item: serializeReel(reel, userId, reposter ? {
        id: reposter.id, name: reposter.name, slug: reposter.artist?.slug,
        photoUrl: reposter.artist?.photoUrl ?? '', isVerified: reposter.artist?.isVerified ?? false,
      } : undefined),
    };
    const existing = merged.get(reel.id);
    if (!existing || entry.sortDate > existing.sortDate) merged.set(reel.id, entry);
  }

  const sorted = Array.from(merged.values()).sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime()).slice(0, take);
  const items = sorted.map((s) => s.item);
  const nextCursor = sorted.length === take ? sorted[sorted.length - 1].sortDate.toISOString() : null;
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
