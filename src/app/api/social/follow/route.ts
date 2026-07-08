export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { followArtist, unfollowArtist, getFollowStatus, getBulkFollowStatus } from '@/lib/social';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// GET /api/social/follow?artistId=xxx  — check follow status
// GET /api/social/follow?artistIds=a,b,c — bulk check (feed follow buttons)
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    const artistIdsParam = req.nextUrl.searchParams.get('artistIds');
    if (artistIdsParam) {
      if (!user) return NextResponse.json({ following: {} });
      const artistIds = artistIdsParam.split(',').filter(Boolean).slice(0, 100);
      const following = await getBulkFollowStatus(user.id, artistIds);
      return NextResponse.json({ following });
    }

    if (!user) return NextResponse.json({ isFollowing: false });

    const artistId = req.nextUrl.searchParams.get('artistId');
    if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });

    const status = await getFollowStatus(user.id, artistId);
    return NextResponse.json(status);
  } catch (err) {
    console.error('[Follow] GET error:', err);
    return NextResponse.json({ isFollowing: false });
  }
}

// POST /api/social/follow  — follow an artist
// Body: { artistId }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.follow_action, ip);
    if (limited) return NextResponse.json({ error: 'Too many follow actions — please slow down' }, { status: 429 });

    const { artistId } = await req.json();
    if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });

    await followArtist(user.id, artistId);
    return NextResponse.json({ ok: true, isFollowing: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to follow artist';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/social/follow?artistId=xxx  — unfollow
export async function DELETE(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artistId = req.nextUrl.searchParams.get('artistId');
    if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });

    await unfollowArtist(user.id, artistId);
    return NextResponse.json({ ok: true, isFollowing: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to unfollow artist';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
