export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getStreamingBreakdown, getStreamTimeSeries } from '@/lib/analytics';
import prisma from '@/lib/prisma';

// GET /api/analytics/streaming?days=30
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '30'), 365);

    const [breakdown, timeSeries] = await Promise.all([
      getStreamingBreakdown(artist.id, days),
      getStreamTimeSeries(artist.id, days),
    ]);

    return NextResponse.json({ breakdown, timeSeries });
  } catch (err) {
    console.error('[Analytics/Streaming] Error:', err);
    return NextResponse.json({ error: 'Failed to load streaming analytics' }, { status: 500 });
  }
}
