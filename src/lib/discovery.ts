/**
 * VUKA  Discovery Engine (Phase 3)
 * Trending, Search, Recommendations, Categories, Rankings
 */

import prisma from './prisma';
import type { Prisma } from '@prisma/client';

//  SEARCH 

export interface SearchResult {
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string;
  genre: string;
  tags: string[];
  imageUrl: string;
  slug: string;
  score: number;
}

export async function search(
  query: string,
  entityType?: string,
  genre?: string,
  page = 1,
  limit = 20
): Promise<{ results: SearchResult[]; total: number; hasMore: boolean }> {
  if (!query?.trim() || query.trim().length < 2) {
    return { results: [], total: 0, hasMore: false };
  }

  const q = query.trim();
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const where: Record<string, unknown> = {
    isActive: true,
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { subtitle: { contains: q, mode: 'insensitive' } },
      { genre: { contains: q, mode: 'insensitive' } },
      { tags: { has: q.toLowerCase() } },
    ],
    ...(entityType ? { entityType } : {}),
    ...(genre ? { genre: { contains: genre, mode: 'insensitive' } } : {}),
  };

  const [results, total] = await Promise.all([
    prisma.searchIndex.findMany({
      where,
      orderBy: [{ score: 'desc' }],
      skip,
      take,
    }) as Promise<SearchResult[]>,
    prisma.searchIndex.count({ where }),
  ]);

  return { results, total, hasMore: skip + results.length < total };
}

/** Autocomplete  fast prefix search, max 8 results per type. */
export async function autocomplete(
  query: string
): Promise<{ artists: SearchResult[]; beats: SearchResult[]; releases: SearchResult[] }> {
  if (!query?.trim() || query.length < 2) {
    return { artists: [], beats: [], releases: [] };
  }

  const q = query.trim();
  const where = {
    isActive: true,
    title: { contains: q, mode: 'insensitive' as const },
  };

  const [artists, beats, releases] = await Promise.all([
    prisma.searchIndex.findMany({
      where: { ...where, entityType: 'artist' },
      orderBy: { score: 'desc' },
      take: 5,
    }) as Promise<SearchResult[]>,
    prisma.searchIndex.findMany({
      where: { ...where, entityType: 'beat' },
      orderBy: { score: 'desc' },
      take: 5,
    }) as Promise<SearchResult[]>,
    prisma.searchIndex.findMany({
      where: { ...where, entityType: 'release' },
      orderBy: { score: 'desc' },
      take: 5,
    }) as Promise<SearchResult[]>,
  ]);

  return { artists, beats, releases };
}

//  TRENDING 

export interface TrendingItem {
  id: string;
  score: number;
  delta: number;
  rank: number;
}

/**
 * Get the most recent trending snapshot for a given period+category.
 * Falls back to computing on-the-fly if no snapshot exists.
 */
export async function getTrending(
  period: 'hourly' | 'daily' | 'weekly',
  category: 'beats' | 'artists' | 'releases' | 'tags',
  limit = 20
): Promise<{ items: TrendingItem[]; computedAt: Date | null; isFresh: boolean }> {
  const maxAge = period === 'hourly' ? 60 : period === 'daily' ? 60 * 24 : 60 * 24 * 7;
  const staleThreshold = new Date(Date.now() - maxAge * 60 * 1000);

  const snapshot = await prisma.trendingSnapshot.findFirst({
    where: { period, category, createdAt: { gte: staleThreshold } },
    orderBy: { createdAt: 'desc' },
  });

  if (snapshot) {
    const items = (snapshot.items as unknown as TrendingItem[]).slice(0, limit);
    return { items, computedAt: snapshot.createdAt, isFresh: true };
  }

  // No fresh snapshot  compute on-the-fly and cache
  const items = await computeTrending(period, category, limit);
  await prisma.trendingSnapshot.create({ data: { period, category, items: items as unknown as Prisma.InputJsonValue } });
  return { items, computedAt: new Date(), isFresh: false };
}

async function computeTrending(
  period: string,
  category: string,
  limit: number
): Promise<TrendingItem[]> {
  const windowStart = new Date(
    Date.now() -
      (period === 'hourly' ? 3_600_000 : period === 'daily' ? 86_400_000 : 604_800_000)
  );

  if (category === 'beats') {
    const beats = await prisma.beat.findMany({
      where: { isActive: true, createdAt: { gte: windowStart } },
      select: { id: true, plays: true, sales: true },
      orderBy: [{ plays: 'desc' }, { sales: 'desc' }],
      take: limit * 2,
    });
    return beats.slice(0, limit).map((b, i) => ({
      id: b.id,
      score: b.plays * 0.1 + b.sales * 10,
      delta: 0,
      rank: i + 1,
    }));
  }

  if (category === 'artists') {
    const artists = await prisma.artist.findMany({
      where: { isPublic: true },
      select: { id: true, totalPlays: true, _count: { select: { followers: true } } },
      orderBy: { totalPlays: 'desc' },
      take: limit,
    });
    return artists.map((a, i) => ({
      id: a.id,
      score: a.totalPlays * 0.1 + a._count.followers * 5,
      delta: 0,
      rank: i + 1,
    }));
  }

  if (category === 'releases') {
    const releases = await prisma.release.findMany({
      where: { isActive: true, createdAt: { gte: windowStart } },
      select: { id: true, plays: true, sales: true },
      orderBy: [{ plays: 'desc' }, { sales: 'desc' }],
      take: limit,
    });
    return releases.map((r, i) => ({
      id: r.id,
      score: r.plays * 0.1 + r.sales * 10,
      delta: 0,
      rank: i + 1,
    }));
  }

  if (category === 'tags') {
    // Aggregate genre tags across active beats
    const beats = await prisma.beat.findMany({
      where: { isActive: true },
      select: { genre: true, tags: true, plays: true },
    });
    const tagScores: Record<string, number> = {};
    for (const b of beats) {
      const allTags = [b.genre, ...b.tags].filter(Boolean);
      for (const t of allTags) {
        tagScores[t] = (tagScores[t] ?? 0) + b.plays;
      }
    }
    return Object.entries(tagScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([id, score], i) => ({ id, score, delta: 0, rank: i + 1 }));
  }

  return [];
}

//  RECOMMENDATIONS 

/** Simple collaborative-style recommendations based on genre + follow graph. */
export async function getRecommendedBeats(
  userId: string,
  limit = 20
): Promise<object[]> {
  // Get followed artists' genres
  const follows = await prisma.follow.findMany({
    where: { userId },
    include: { artist: { select: { genreTags: true } } },
  });

  const preferredGenres = [...new Set(follows.flatMap((f) => f.artist.genreTags))];
  const followedArtistIds = follows.map((f) => f.artistId);

  // Purchased beat IDs (exclude from recs)
  const purchases = await prisma.purchase.findMany({
    where: { userId, status: 'confirmed', itemType: 'beat' },
    select: { beatId: true },
  });
  const purchasedIds = purchases.map((p) => p.beatId).filter(Boolean) as string[];

  const where: Record<string, unknown> = {
    isActive: true,
    id: { notIn: purchasedIds },
    OR: preferredGenres.length > 0
      ? [
          { genre: { in: preferredGenres } },
          { tags: { hasSome: preferredGenres } },
          { artistId: { in: followedArtistIds } },
        ]
      : [{ isActive: true }],
  };

  const beats = await prisma.beat.findMany({
    where,
    include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
    orderBy: [{ plays: 'desc' }, { sales: 'desc' }],
    take: limit,
  });

  return beats;
}

export async function getRecommendedArtists(
  userId: string,
  limit = 12
): Promise<object[]> {
  const followedIds = await prisma.follow
    .findMany({ where: { userId }, select: { artistId: true } })
    .then((f) => f.map((x) => x.artistId));

  // Artists similar to those already followed (same genres)
  const followedArtists = await prisma.artist.findMany({
    where: { id: { in: followedIds } },
    select: { genreTags: true },
  });
  const genres = [...new Set(followedArtists.flatMap((a) => a.genreTags))];

  const artists = await prisma.artist.findMany({
    where: {
      isPublic: true,
      id: { notIn: followedIds },
      ...(genres.length > 0 ? { genreTags: { hasSome: genres } } : {}),
    },
    select: {
      id: true, name: true, slug: true, photoUrl: true, coverUrl: true,
      bio: true, city: true, country: true, genreTags: true, totalPlays: true, isVerified: true,
      _count: { select: { followers: true, beats: true, releases: true } },
    },
    orderBy: { totalPlays: 'desc' },
    take: limit,
  });

  return artists;
}

//  CATEGORY BROWSING 

const VUKA_GENRES = [
  'Amapiano', 'Afrobeats', 'Hip-Hop', 'Trap', 'Gqom', 'Kwaito',
  'R&B', 'Soul', 'Dancehall', 'Afro-House', 'Electronic', 'Gospel',
  'Jazz', 'Pop', 'Drill', 'Afro-Pop', 'Bongo Flava', 'Highlife',
];

export async function getBrowseCategories(): Promise<
  Array<{ genre: string; beatCount: number; artistCount: number; topArtist: object | null }>
> {
  const results = await Promise.all(
    VUKA_GENRES.map(async (genre) => {
      const [beatCount, artistCount] = await Promise.all([
        prisma.beat.count({ where: { isActive: true, genre: { contains: genre, mode: 'insensitive' } } }),
        prisma.artist.count({ where: { isPublic: true, genreTags: { has: genre } } }),
      ]);

      const topArtist = beatCount > 0
        ? await prisma.artist.findFirst({
            where: { isPublic: true, genreTags: { has: genre } },
            orderBy: { totalPlays: 'desc' },
            select: { name: true, slug: true, photoUrl: true },
          })
        : null;

      return { genre, beatCount, artistCount, topArtist };
    })
  );

  return results.filter((c) => c.beatCount > 0 || c.artistCount > 0);
}

/** Paginated genre-filtered beat listing (for category pages). */
export async function getBeatsByGenre(
  genre: string,
  page = 1,
  limit = 20,
  sort: 'popular' | 'new' | 'price_asc' | 'price_desc' = 'popular'
): Promise<{ beats: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const orderBy =
    sort === 'new' ? { createdAt: 'desc' as const }
    : sort === 'price_asc' ? { basicPrice: 'asc' as const }
    : sort === 'price_desc' ? { basicPrice: 'desc' as const }
    : { plays: 'desc' as const };

  const where = {
    isActive: true,
    OR: [
      { genre: { contains: genre, mode: 'insensitive' as const } },
      { tags: { has: genre.toLowerCase() } },
    ],
  };

  const [beats, total] = await Promise.all([
    prisma.beat.findMany({
      where,
      include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
      orderBy,
      skip,
      take,
    }),
    prisma.beat.count({ where }),
  ]);

  return { beats, total, hasMore: skip + beats.length < total };
}

/** Paginated artist discovery page. */
export async function discoverArtists(
  genre?: string,
  country?: string,
  sort: 'popular' | 'new' | 'followers' = 'popular',
  page = 1,
  limit = 20
): Promise<{ artists: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const where: Record<string, unknown> = {
    isPublic: true,
    ...(genre ? { genreTags: { has: genre } } : {}),
    ...(country ? { country: { equals: country, mode: 'insensitive' } } : {}),
  };

  const orderBy =
    sort === 'new' ? { createdAt: 'desc' as const }
    : sort === 'followers' ? { followers: { _count: 'desc' as const } }
    : { totalPlays: 'desc' as const };

  const [artists, total] = await Promise.all([
    prisma.artist.findMany({
      where,
      select: {
        id: true, name: true, slug: true, photoUrl: true, coverUrl: true,
        bio: true, city: true, country: true, genreTags: true,
        totalPlays: true, isVerified: true,
        _count: { select: { followers: true, beats: true, releases: true } },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.artist.count({ where }),
  ]);

  return { artists, total, hasMore: skip + artists.length < total };
}
