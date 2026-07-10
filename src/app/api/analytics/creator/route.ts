export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getCreatorAnalytics } from '@/lib/analytics';
import prisma from '@/lib/prisma';
import { clampAnalyticsDays, planAtLeast } from '@/lib/plans';

// GET /api/analytics/creator?days=30
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({
      where: { userId: user.id },
      select: { id: true, planSlug: true, planExpiresAt: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    const requestedDays = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '30'), 365);
    // Free tier is capped to 30 days lookback regardless of what's requested —
    // Pro/Label can request up to the full 365-day range.
    const days = clampAnalyticsDays(requestedDays, artist.planSlug, artist.planExpiresAt);
    const data = await getCreatorAnalytics(artist.id, days);

    // Overview (Free) uses summary.{beatPlays,releasePlays,videoPlays,likes,...}
    // and charts.{plays,revenue} — it never reads comments/reposts or the
    // engagement chart series, those exclusively back the Engagement tab
    // (Pro+/Label only). Strip them server-side for Free.
    const isProOrAbove = planAtLeast(artist.planSlug, artist.planExpiresAt, 'pro');
    if (!isProOrAbove) {
      const { comments, reposts, ...restSummary } = data.summary;
      const { engagement, ...restCharts } = data.charts;
      return NextResponse.json({ ...data, summary: restSummary, charts: restCharts });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics/Creator] Error:', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
