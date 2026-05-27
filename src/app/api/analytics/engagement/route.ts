export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getEngagementAnalytics } from '@/lib/analytics';
import prisma from '@/lib/prisma';

// GET /api/analytics/engagement?days=30
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '30'), 365);
    const data = await getEngagementAnalytics(artist.id, days);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics/Engagement] Error:', err);
    return NextResponse.json({ error: 'Failed to load engagement analytics' }, { status: 500 });
  }
}
