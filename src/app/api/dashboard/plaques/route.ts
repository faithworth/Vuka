// GET /api/dashboard/plaques — artist's earned plaques + current progress
// POST /api/dashboard/plaques — manually trigger a plaque check

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkAndAwardPlaques, THRESHOLDS, tierMeta, dimensionLabel } from '@/lib/plaques';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artistId = user.artist.id;

    // Trigger check on load — catches any plaques earned since last visit
    await checkAndAwardPlaques(artistId).catch(() => {});

    const plaques = await prisma.artistPlaque.findMany({
      where:   { artistId },
      orderBy: { earnedAt: 'desc' },
    });

    // Current metrics for progress display
    const [salesCount, followerCount, membershipRev, rollup] = await Promise.all([
      prisma.purchase.count({ where: { artistId, status: 'confirmed' } }),
      prisma.follow.count({ where: { artistId } }),
      prisma.purchase.aggregate({ _sum: { amount: true }, where: { artistId, status: 'confirmed', itemType: 'membership' } }),
      prisma.analyticsDailyRollup.aggregate({ _sum: { plays: true }, where: { artistId } }),
    ]);

    const metrics = {
      sales_units:        salesCount,
      follower_count:     followerCount,
      membership_revenue: membershipRev._sum.amount ?? 0,
      streams:            rollup._sum.plays ?? 0,
    };

    // Build progress towards next plaque on each dimension
    const progress = Object.entries(THRESHOLDS).map(([dimension, ladder]) => {
      const current = metrics[dimension as keyof typeof metrics] ?? 0;
      const earned  = plaques.filter(p => p.dimension === dimension).map(p => p.tier);
      const next    = ladder.find(step => !earned.includes(step.tier));
      return {
        dimension,
        label:   dimensionLabel(dimension),
        current,
        next:    next ?? null,
        pct:     next ? Math.min(100, Math.round((current / next.milestone) * 100)) : 100,
      };
    });

    return NextResponse.json({
      plaques: plaques.map(p => ({ ...p, meta: tierMeta(p.tier), dimensionLabel: dimensionLabel(p.dimension) })),
      metrics,
      progress,
      totalPlaques: plaques.length,
      highestTier:  plaques[0]?.tier ?? null,
    });
  } catch (err) {
    console.error('[plaques/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const awarded = await checkAndAwardPlaques(user.artist.id);
    return NextResponse.json({ ok: true, newPlaques: awarded.length, plaques: awarded });
  } catch (err) {
    console.error('[plaques/POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
