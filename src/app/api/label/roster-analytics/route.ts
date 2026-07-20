// ============================================================
// src/app/api/label/roster-analytics/route.ts
// ============================================================
// LABEL-EXCLUSIVE CAPABILITY (not just a lower fee):
// Pro artists can see their own analytics. Only a Label owner can see
// ONE aggregated view across every artist on their roster — total
// revenue, sales, plays, and follower growth combined, plus a
// per-artist breakdown and a 30-day trend line. This is only possible
// because Label is the one plan where a single account is structurally
// tied to multiple Artist records (via the roster), so it's a real
// capability gap versus Pro, not a re-skinned version of something
// Pro already has.
//
// GET — requires Label plan (requirePlanAtLeast 'label') and an
// existing Label with at least one ACTIVE roster artist.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePlanAtLeast } from '@/lib/planGates';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gate = await requirePlanAtLeast(user.artist.id, 'label');
  if (!gate.ok) return gate.response;

  const label = await prisma.label.findUnique({
    where: { ownerId: user.id },
    include: {
      roster: {
        where: { status: 'active' },
        include: {
          artist: { select: { id: true, name: true, slug: true, photoUrl: true, lifetimeGrossSales: true } },
        },
      },
    },
  });

  if (!label) return NextResponse.json({ error: 'No label found' }, { status: 404 });

  const artistIds = label.roster.map(r => r.artist.id);
  if (artistIds.length === 0) {
    return NextResponse.json({
      totals: { revenue30d: 0, sales30d: 0, plays30d: 0, newFollowers30d: 0, lifetimeGross: 0 },
      perArtist: [],
      trend: [],
    });
  }

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  // One query across the whole roster, then aggregate in memory by
  // artistId and by date — far cheaper than N separate per-artist queries.
  const rollups = await prisma.analyticsDailyRollup.findMany({
    where: { artistId: { in: artistIds }, date: { gte: since } },
    select: {
      artistId: true, date: true,
      totalRevenue: true, beatSales: true, releaseSales: true,
      beatPlays: true, releasePlays: true, videoPlays: true,
      followers: true,
    },
  });

  const perArtistMap: Record<string, {
    revenue30d: number; sales30d: number; plays30d: number; newFollowers30d: number;
  }> = {};
  for (const id of artistIds) {
    perArtistMap[id] = { revenue30d: 0, sales30d: 0, plays30d: 0, newFollowers30d: 0 };
  }

  const trendMap: Record<string, number> = {}; // date -> revenue summed across roster

  for (const r of rollups) {
    const bucket = perArtistMap[r.artistId];
    if (bucket) {
      bucket.revenue30d      += r.totalRevenue;
      bucket.sales30d        += r.beatSales + r.releaseSales;
      bucket.plays30d        += r.beatPlays + r.releasePlays + r.videoPlays;
      bucket.newFollowers30d += r.followers;
    }
    trendMap[r.date] = (trendMap[r.date] ?? 0) + r.totalRevenue;
  }

  const perArtist = label.roster
    .map(r => ({
      artistId:  r.artist.id,
      name:      r.artist.name,
      slug:      r.artist.slug,
      photoUrl:  r.artist.photoUrl,
      revenueShare: r.revenueShare,
      lifetimeGross: r.artist.lifetimeGrossSales,
      ...perArtistMap[r.artist.id],
    }))
    .sort((a, b) => b.revenue30d - a.revenue30d);

  const totals = perArtist.reduce(
    (acc, a) => ({
      revenue30d:      acc.revenue30d + a.revenue30d,
      sales30d:        acc.sales30d + a.sales30d,
      plays30d:        acc.plays30d + a.plays30d,
      newFollowers30d: acc.newFollowers30d + a.newFollowers30d,
      lifetimeGross:   acc.lifetimeGross + a.lifetimeGross,
    }),
    { revenue30d: 0, sales30d: 0, plays30d: 0, newFollowers30d: 0, lifetimeGross: 0 },
  );

  // Zero-filled 30-day trend so the frontend can render a continuous line
  // even on days with no roster-wide sales.
  const trend: { date: string; revenue: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    trend.push({ date: d, revenue: Math.round((trendMap[d] ?? 0) * 100) / 100 });
  }

  return NextResponse.json({ totals, perArtist, trend });
}
