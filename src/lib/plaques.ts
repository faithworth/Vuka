// src/lib/plaques.ts
// Plaques / Achievements engine.
// Multi-dimensional milestones: sales units, streams, follower count,
// membership revenue. Shareable image URL generated on first earn.
//
// Run checkAndAwardPlaques(artistId) after any event that might
// push an artist over a threshold (purchase confirmed, follow created,
// membership activated, stream counted).

import prisma from '@/lib/prisma';

// ── Tier definitions ──────────────────────────────────────────────────────────
// Order matters: checked lowest → highest so all new tiers are caught.

export const PLAQUE_TIERS = [
  { tier: 'first_sale',      label: 'First Sale',       color: '#22c55e',  emoji: '⚡' },
  { tier: 'bronze',          label: 'Bronze',           color: '#cd7f32',  emoji: '🥉' },
  { tier: 'silver',          label: 'Silver',           color: '#9ca3af',  emoji: '🥈' },
  { tier: 'gold',            label: 'Gold',             color: '#d4a000',  emoji: '🥇' },
  { tier: 'platinum',        label: 'Platinum',         color: '#38b2ac',  emoji: '💎' },
  { tier: 'diamond',         label: 'Diamond',          color: '#60a5fa',  emoji: '💠' },
  { tier: 'multi_platinum',  label: 'Multi-Platinum',   color: '#a78bfa',  emoji: '👑' },
] as const;

export type PlaqueTier = typeof PLAQUE_TIERS[number]['tier'];

// ── Dimension thresholds ──────────────────────────────────────────────────────
// Each dimension has its own ladder. An artist earns a plaque the first time
// they cross any threshold on any dimension.

export const THRESHOLDS: Record<string, { tier: PlaqueTier; milestone: number }[]> = {
  sales_units: [
    { tier: 'first_sale',     milestone: 1 },
    { tier: 'bronze',         milestone: 100 },
    { tier: 'silver',         milestone: 500 },
    { tier: 'gold',           milestone: 1_000 },
    { tier: 'platinum',       milestone: 5_000 },
    { tier: 'diamond',        milestone: 10_000 },
    { tier: 'multi_platinum', milestone: 25_000 },
  ],
  follower_count: [
    { tier: 'first_sale',     milestone: 1 },    // "First Follower" — same tier, different dimension
    { tier: 'bronze',         milestone: 100 },
    { tier: 'silver',         milestone: 500 },
    { tier: 'gold',           milestone: 1_000 },
    { tier: 'platinum',       milestone: 5_000 },
    { tier: 'diamond',        milestone: 10_000 },
    { tier: 'multi_platinum', milestone: 25_000 },
  ],
  membership_revenue: [
    // Rand thresholds on cumulative membership revenue
    { tier: 'bronze',         milestone: 1_000 },
    { tier: 'silver',         milestone: 5_000 },
    { tier: 'gold',           milestone: 10_000 },
    { tier: 'platinum',       milestone: 50_000 },
    { tier: 'diamond',        milestone: 100_000 },
    { tier: 'multi_platinum', milestone: 250_000 },
  ],
  streams: [
    { tier: 'first_sale',     milestone: 100 },
    { tier: 'bronze',         milestone: 1_000 },
    { tier: 'silver',         milestone: 10_000 },
    { tier: 'gold',           milestone: 50_000 },
    { tier: 'platinum',       milestone: 100_000 },
    { tier: 'diamond',        milestone: 500_000 },
    { tier: 'multi_platinum', milestone: 1_000_000 },
  ],
};

// ── Shareable image URL ───────────────────────────────────────────────────────
// Returns an OG image URL. Uses Vercel OG (/api/og/plaque) when in production.
// The route renders an SVG card; this URL is what artists share to socials.

function plaqueShareUrl(artistSlug: string, tier: string, dimension: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vukamusic.com';
  return `${base}/api/og/plaque?artist=${artistSlug}&tier=${tier}&dim=${dimension}`;
}

// ── Current metric values ─────────────────────────────────────────────────────

async function getCurrentMetrics(artistId: string) {
  const [salesCount, followerCount, membershipRev, rollup] = await Promise.all([
    // confirmed unit sales
    prisma.purchase.count({
      where: { artistId, status: 'confirmed' },
    }),
    // followers
    prisma.follow.count({ where: { artistId } }),
    // lifetime membership revenue (sum of confirmed membership purchases)
    prisma.purchase.aggregate({
      _sum: { amount: true },
      where: { artistId, status: 'confirmed', itemType: 'membership' },
    }),
    // total streams from analytics rollup
    prisma.analyticsDailyRollup.aggregate({
      _sum: { plays: true },
      where: { artistId },
    }),
  ]);

  return {
    sales_units:        salesCount,
    follower_count:     followerCount,
    membership_revenue: membershipRev._sum.amount ?? 0,
    streams:            rollup._sum.plays ?? 0,
  };
}

// ── Main: check and award ─────────────────────────────────────────────────────

export async function checkAndAwardPlaques(artistId: string): Promise<ArtistPlaque[]> {
  const artist = await prisma.artist.findUnique({
    where:  { id: artistId },
    select: { id: true, slug: true },
  });
  if (!artist) return [];

  const metrics  = await getCurrentMetrics(artistId);
  const existing = await prisma.artistPlaque.findMany({
    where:  { artistId },
    select: { tier: true, dimension: true },
  });

  const existingSet = new Set(existing.map(p => `${p.tier}:${p.dimension}`));
  const toAward: { tier: PlaqueTier; dimension: string; milestone: number }[] = [];

  for (const [dimension, ladder] of Object.entries(THRESHOLDS)) {
    const current = metrics[dimension as keyof typeof metrics] ?? 0;
    for (const step of ladder) {
      const key = `${step.tier}:${dimension}`;
      if (current >= step.milestone && !existingSet.has(key)) {
        toAward.push({ tier: step.tier, dimension, milestone: step.milestone });
      }
    }
  }

  if (toAward.length === 0) return [];

  // Create all new plaques in one transaction
  const awarded = await prisma.$transaction(
    toAward.map(p =>
      prisma.artistPlaque.create({
        data: {
          id:           `plq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          artistId,
          tier:         p.tier,
          dimension:    p.dimension,
          milestone:    p.milestone,
          shareableUrl: plaqueShareUrl(artist.slug, p.tier, p.dimension),
        },
      })
    )
  );

  return awarded;
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function tierMeta(tier: string) {
  return PLAQUE_TIERS.find(t => t.tier === tier) ?? {
    tier, label: tier, color: '#9ca3af', emoji: '🏆',
  };
}

export function dimensionLabel(dimension: string): string {
  const labels: Record<string, string> = {
    sales_units:        'Sales',
    follower_count:     'Followers',
    membership_revenue: 'Membership Revenue',
    streams:            'Plays',
  };
  return labels[dimension] ?? dimension;
}

// Re-export Prisma type for convenience
export type ArtistPlaque = {
  id: string;
  artistId: string;
  tier: string;
  dimension: string;
  milestone: number;
  shareableUrl: string;
  earnedAt: Date;
};
