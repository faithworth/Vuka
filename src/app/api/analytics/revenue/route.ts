export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getRevenueAnalytics } from '@/lib/analytics';
import prisma from '@/lib/prisma';
import { planAtLeast } from '@/lib/plans';

// GET /api/analytics/revenue?months=12
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({
      where: { userId: user.id },
      select: { id: true, planSlug: true, planExpiresAt: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    // This endpoint exclusively backs the Revenue tab (monthly breakdown,
    // top beats/releases, conversion rate, revenue-by-source) — Overview
    // gets its own revenue trend from /api/analytics/creator instead, so
    // nothing here is needed by Free's Overview tab. Skip the query and
    // return a locked stub rather than computing data Free can't see.
    const isProOrAbove = planAtLeast(artist.planSlug, artist.planExpiresAt, 'pro');
    if (!isProOrAbove) {
      return NextResponse.json({
        monthlyRevenue: [], topBeats: [], topReleases: [],
        conversionRate: 0, totalSales: 0, totalPlays: 0, breakdown: null,
        locked: true,
      });
    }

    const requestedMonths = Math.min(parseInt(req.nextUrl.searchParams.get('months') ?? '12'), 24);
    const data = await getRevenueAnalytics(artist.id, requestedMonths);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics/Revenue] Error:', err);
    return NextResponse.json({ error: 'Failed to load revenue analytics' }, { status: 500 });
  }
}
