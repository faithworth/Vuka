/**
 * VUKA — Stories (24h ephemeral updates)
 */

import prisma from './prisma';
import { logger } from './logger';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_CAPTION_LEN = 200;

export interface CreateStoryInput {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
}

export async function createStory(artistId: string, input: CreateStoryInput) {
  if (!input.mediaUrl) throw new Error('mediaUrl required');
  const caption = (input.caption ?? '').slice(0, MAX_CAPTION_LEN);

  return prisma.story.create({
    data: {
      artistId,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType === 'video' ? 'video' : 'image',
      caption,
      expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
    },
  });
}

/**
 * Active stories bar for the feed: every artist with an unexpired story,
 * platform-wide — not just people you follow. Artist stories here are
 * public promotional content (not private social posts), so there's no
 * privacy reason to hide them from someone who hasn't followed that artist
 * yet; hiding them was actively counter-productive since it meant a fan
 * following nobody (i.e. most new accounts) saw an empty bar with nothing
 * to discover. Ordering still favors your network: followed-with-unseen
 * first, then anyone else with unseen, then already-seen.
 */
export async function getStoriesBar(userId: string) {
  const followedArtistIds = new Set(
    (await prisma.follow.findMany({ where: { userId }, select: { artistId: true } })).map((f) => f.artistId)
  );

  const stories = await prisma.story.findMany({
    where: { expiresAt: { gt: new Date() } },
    include: {
      artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true } },
      views: { where: { userId }, select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 500, // generous cap; this is a discovery bar, not a full listing
  });

  // Group by artist, preserving chronological order within each group.
  const byArtist = new Map<string, typeof stories>();
  for (const s of stories) {
    const list = byArtist.get(s.artistId) ?? [];
    list.push(s);
    byArtist.set(s.artistId, list);
  }

  return Array.from(byArtist.values()).map((group) => ({
    artist: group[0].artist,
    isFollowing: followedArtistIds.has(group[0].artistId),
    hasUnseen: group.some((s) => s.views.length === 0),
    stories: group.map((s) => ({
      id: s.id,
      mediaUrl: s.mediaUrl,
      mediaType: s.mediaType,
      caption: s.caption,
      viewCount: s.viewCount,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      viewedByMe: s.views.length > 0,
    })),
  })).sort((a, b) => {
    // Followed-with-unseen > anyone-with-unseen > followed-seen > seen
    const score = (g: { isFollowing: boolean; hasUnseen: boolean }) =>
      (g.hasUnseen ? 2 : 0) + (g.isFollowing ? 1 : 0);
    return score(b) - score(a);
  });
}

export async function getMyStories(artistId: string) {
  return prisma.story.findMany({
    where: { artistId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { views: true } } },
  });
}

export async function markStoryViewed(storyId: string, userId: string): Promise<void> {
  try {
    const created = await prisma.storyView.create({ data: { storyId, userId } }).catch(() => null);
    if (created) {
      await prisma.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
    }
  } catch (err) {
    logger.warn('[stories] markStoryViewed failed', { storyId, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function deleteStory(storyId: string, userId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { artist: { select: { userId: true } } },
  });
  if (!story) throw new Error('Story not found');
  if (story.artist.userId !== userId) throw new Error('Not your story');
  await prisma.story.delete({ where: { id: storyId } });
}
