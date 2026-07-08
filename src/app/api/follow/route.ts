// This is the endpoint the artist-profile FollowButton actually calls.
// It now delegates to the shared lib/social.ts implementation so follow
// actions taken here and from the feed's inline follow buttons behave
// identically: same notification fan-out, same plaque milestone checks,
// same rate limiting. (Previously this route re-implemented follow/unfollow
// directly against Prisma and never notified the artist or rate-limited.)

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { followArtist, unfollowArtist, getFollowStatus, getBulkFollowStatus } from '@/lib/social';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// GET /api/follow?artistId=xxx        — check if following
// GET /api/follow?artistIds=a,b,c     — bulk check (feed follow buttons)
export async function GET(req: NextRequest) {
  const user = await getServerUser();

  const artistIdsParam = req.nextUrl.searchParams.get('artistIds');
  if (artistIdsParam) {
    if (!user) return NextResponse.json({ following: {} });
    const artistIds = artistIdsParam.split(',').filter(Boolean).slice(0, 100);
    const following = await getBulkFollowStatus(user.id, artistIds);
    return NextResponse.json({ following });
  }

  if (!user) return NextResponse.json({ following: false });
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ following: false });
  const following = await getFollowStatus(user.id, artistId);
  return NextResponse.json({ following });
}

// POST /api/follow — toggle follow
export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getClientIp(req.headers);
  const limited = await rateLimit(user.id, RATE_LIMITS.follow_action, ip);
  if (limited) return NextResponse.json({ error: 'Too many follow actions — please slow down' }, { status: 429 });

  const { artistId } = await req.json();
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  try {
    const wasFollowing = await getFollowStatus(user.id, artistId);
    if (wasFollowing) {
      await unfollowArtist(user.id, artistId);
      return NextResponse.json({ following: false });
    }
    await followArtist(user.id, artistId);
    return NextResponse.json({ following: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update follow status';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
