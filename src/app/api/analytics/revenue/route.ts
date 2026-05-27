export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getRevenueAnalytics } from '@/lib/analytics';
import prisma from '@/lib/prisma';

// GET /api/analytics/revenue?months=12
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    const months = Math.min(parseInt(req.nextUrl.searchParams.get('months') ?? '12'), 24);
    const data = await getRevenueAnalytics(artist.id, months);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics/Revenue] Error:', err);
    return NextResponse.json({ error: 'Failed to load revenue analytics' }, { status: 500 });
  }
}
