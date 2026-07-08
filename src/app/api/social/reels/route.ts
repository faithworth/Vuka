export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createReel, getReelsFeed } from '@/lib/reels';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// GET /api/social/reels?tab=following|discover&cursor=ISO&limit=10
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tab = req.nextUrl.searchParams.get('tab') === 'following' ? 'following' : 'discover';
    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10'), 20);

    const result = await getReelsFeed(user.id, tab, cursor, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Reels] GET error:', err);
    return NextResponse.json({ error: 'Failed to load reels' }, { status: 500 });
  }
}

// POST /api/social/reels — create a reel (artist only)
// Body: { videoUrl, thumbnailUrl?, caption? }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile required' }, { status: 403 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.reel_create, ip);
    if (limited) return NextResponse.json({ error: 'Too many reels — try again later' }, { status: 429 });

    const { videoUrl, thumbnailUrl, caption } = await req.json();
    if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 });

    const reel = await createReel(artist.id, { videoUrl, thumbnailUrl, caption });
    return NextResponse.json({ reel }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create reel';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
