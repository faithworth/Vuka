export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { followArtist, unfollowArtist, getFollowStatus } from '@/lib/social';

// GET /api/social/follow?artistId=xxx  — check follow status
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
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

    const { artistId } = await req.json();
    if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });

    const result = await followArtist(user.id, artistId);
    return NextResponse.json(result);
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

    const result = await unfollowArtist(user.id, artistId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to unfollow artist';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
