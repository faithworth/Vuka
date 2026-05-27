export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getAudienceAnalytics } from '@/lib/analytics';
import prisma from '@/lib/prisma';

// GET /api/analytics/audience
export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    const data = await getAudienceAnalytics(artist.id);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics/Audience] Error:', err);
    return NextResponse.json({ error: 'Failed to load audience analytics' }, { status: 500 });
  }
}
