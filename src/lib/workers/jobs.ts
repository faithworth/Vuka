/**
 * VUKA — Background Worker Jobs (Phase 3)
 * Invoked via cron (Vercel Cron / pg_cron / external scheduler).
 *
 * Jobs:
 *   syncSearchIndex()      — Rebuild SearchIndex from beats, releases, artists
 *   computeAllTrending()   — Refresh all TrendingSnapshot entries
 *   cleanupStaleData()     — Prune old SpamSignal + PageView rows
 *
 * Trigger from: /api/workers/cron route (protected by CRON_SECRET env var).
 */

import prisma from '../prisma';

// ── SEARCH INDEX SYNC ─────────────────────────────────────────

/**
 * Upsert a SearchIndex entry for every active beat, release, and artist.
 * Call this on every significant content change (upload, update, deactivate)
 * or run as a scheduled full-rebuild every few hours.
 */
export async function syncSearchIndex(): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  // ── Beats ──
  const beats = await prisma.beat.findMany({
    where: { isActive: true },
    select: {
      id: true, title: true, slug: true, genre: true, tags: true,
      artworkUrl: true, plays: true, sales: true,
      artist: { select: { name: true } },
    },
  });

  for (const beat of beats) {
    try {
      await prisma.searchIndex.upsert({
        where: { entityType_entityId: { entityType: 'beat', entityId: beat.id } },
        create: {
          entityType: 'beat',
          entityId: beat.id,
          title: beat.title,
          subtitle: beat.artist.name,
          tags: beat.tags,
          genre: beat.genre,
          imageUrl: beat.artworkUrl,
          slug: beat.slug,
          score: beat.plays * 0.1 + beat.sales * 10,
          isActive: true,
        },
        update: {
          title: beat.title,
          subtitle: beat.artist.name,
          tags: beat.tags,
          genre: beat.genre,
          score: beat.plays * 0.1 + beat.sales * 10,
          isActive: true,
        },
      });
      synced++;
    } catch {
      errors++;
    }
  }

  // Deactivate removed beats
  const activeBeatIds = beats.map((b) => b.id);
  await prisma.searchIndex.updateMany({
    where: { entityType: 'beat', entityId: { notIn: activeBeatIds } },
    data: { isActive: false },
  });

  // ── Releases ──
  const releases = await prisma.release.findMany({
    where: { isActive: true },
    select: {
      id: true, title: true, slug: true, genre: true, artworkUrl: true,
      plays: true, sales: true,
      artist: { select: { name: true } },
    },
  });

  for (const release of releases) {
    try {
      await prisma.searchIndex.upsert({
        where: { entityType_entityId: { entityType: 'release', entityId: release.id } },
        create: {
          entityType: 'release',
          entityId: release.id,
          title: release.title,
          subtitle: release.artist.name,
          tags: [],
          genre: release.genre ?? '',
          imageUrl: release.artworkUrl ?? '',
          slug: release.slug,
          score: release.plays * 0.1 + release.sales * 10,
          isActive: true,
        },
        update: {
          title: release.title,
          score: release.plays * 0.1 + release.sales * 10,
          isActive: true,
        },
      });
      synced++;
    } catch {
      errors++;
    }
  }

  // ── Artists ──
  const artists = await prisma.artist.findMany({
    where: { isPublic: true },
    select: {
      id: true, name: true, slug: true, genreTags: true,
      photoUrl: true, totalPlays: true,
      _count: { select: { followers: true } },
    },
  });

  for (const artist of artists) {
    try {
      await prisma.searchIndex.upsert({
        where: { entityType_entityId: { entityType: 'artist', entityId: artist.id } },
        create: {
          entityType: 'artist',
          entityId: artist.id,
          title: artist.name,
          subtitle: artist.genreTags.join(', '),
          tags: artist.genreTags,
          genre: artist.genreTags[0] ?? '',
          imageUrl: artist.photoUrl,
          slug: artist.slug,
          score: artist.totalPlays * 0.1 + artist._count.followers * 5,
          isActive: true,
        },
        update: {
          subtitle: artist.genreTags.join(', '),
          tags: artist.genreTags,
          score: artist.totalPlays * 0.1 + artist._count.followers * 5,
          isActive: true,
        },
      });
      synced++;
    } catch {
      errors++;
    }
  }

  return { synced, errors };
}

// ── TRENDING COMPUTATION ──────────────────────────────────────

const TRENDING_MATRIX = [
  { period: 'hourly' as const, category: 'beats' as const },
  { period: 'daily' as const, category: 'beats' as const },
  { period: 'daily' as const, category: 'artists' as const },
  { period: 'daily' as const, category: 'releases' as const },
  { period: 'daily' as const, category: 'tags' as const },
  { period: 'weekly' as const, category: 'beats' as const },
  { period: 'weekly' as const, category: 'artists' as const },
  { period: 'weekly' as const, category: 'releases' as const },
];

export async function computeAllTrending(): Promise<void> {
  // Import lazily to avoid circular dependency
  const { getTrending } = await import('../discovery');
  await Promise.allSettled(
    TRENDING_MATRIX.map(({ period, category }) =>
      // Force fresh computation by deleting stale snapshots first
      prisma.trendingSnapshot
        .deleteMany({ where: { period, category } })
        .then(() => getTrending(period, category, 50))
    )
  );
}

// ── CLEANUP ───────────────────────────────────────────────────

export async function cleanupStaleData(): Promise<{ deleted: number }> {
  const hourAgo = new Date(Date.now() - 3_600_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);

  const [spamDeleted, pageViewsDeleted] = await Promise.all([
    // Clean up expired spam signals
    prisma.spamSignal.deleteMany({ where: { windowStart: { lt: hourAgo } } }),
    // Clean up old anonymous page views (keep authed ones longer)
    prisma.pageView.deleteMany({
      where: { userId: null, createdAt: { lt: weekAgo } },
    }),
  ]);

  // Clean up old trending snapshots (keep only last 3 per period+category)
  const snapshotGroups = await prisma.trendingSnapshot.groupBy({
    by: ['period', 'category'],
    _max: { computedAt: true },
  });

  let snapshotsDeleted = 0;
  for (const group of snapshotGroups) {
    const old = await prisma.trendingSnapshot.findMany({
      where: { period: group.period, category: group.category },
      orderBy: { computedAt: 'desc' },
      skip: 3,
      select: { id: true },
    });
    if (old.length > 0) {
      const res = await prisma.trendingSnapshot.deleteMany({
        where: { id: { in: old.map((s) => s.id) } },
      });
      snapshotsDeleted += res.count;
    }
  }

  // Archive old notifications (> 90 days, already read)
  await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: monthAgo } },
  });

  return {
    deleted: spamDeleted.count + pageViewsDeleted.count + snapshotsDeleted,
  };
}
