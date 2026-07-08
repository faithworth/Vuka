export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createStory, getStoriesBar } from '@/lib/stories';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// GET /api/social/stories — the stories bar (people you follow + your own, unexpired)
export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const bar = await getStoriesBar(user.id);
    return NextResponse.json({ bar });
  } catch (err) {
    console.error('[Stories] GET error:', err);
    return NextResponse.json({ error: 'Failed to load stories' }, { status: 500 });
  }
}

// POST /api/social/stories — create a story (artist only)
// Body: { mediaUrl, mediaType: 'image'|'video', caption? }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile required' }, { status: 403 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.story_create, ip);
    if (limited) return NextResponse.json({ error: 'Too many stories — try again later' }, { status: 429 });

    const { mediaUrl, mediaType, caption } = await req.json();
    if (!mediaUrl) return NextResponse.json({ error: 'mediaUrl required' }, { status: 400 });

    const story = await createStory(artist.id, { mediaUrl, mediaType, caption });
    return NextResponse.json({ story }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create story';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
