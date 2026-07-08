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
 * Active stories bar for the feed: one entry per artist (their most recent
 * unexpired stories), for artists the viewer follows plus their own —
 * mirrors Instagram's "people you follow first" story-ring ordering.
 */
export async function getStoriesBar(userId: string) {
  const followedArtistIds = (
    await prisma.follow.findMany({ where: { userId }, select: { artistId: true } })
  ).map((f) => f.artistId);

  const myArtist = await prisma.artist.findUnique({ where: { userId }, select: { id: true } });
  const artistIds = Array.from(new Set([...followedArtistIds, ...(myArtist ? [myArtist.id] : [])]));
  if (artistIds.length === 0) return [];

  const stories = await prisma.story.findMany({
    where: { artistId: { in: artistIds }, expiresAt: { gt: new Date() } },
    include: {
      artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true } },
      views: { where: { userId }, select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
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
  })).sort((a, b) => (a.hasUnseen === b.hasUnseen ? 0 : a.hasUnseen ? -1 : 1));
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
