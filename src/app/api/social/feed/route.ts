export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getDiscoverFeed, getFollowingFeedWithReposts } from '@/lib/social';

// GET /api/social/feed?tab=following|discover&cursor=ISO&limit=20
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tab = req.nextUrl.searchParams.get('tab') === 'discover' ? 'discover' : 'following';
    const cursorParam = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    if (tab === 'discover') {
      const result = await getDiscoverFeed(user.id, cursorParam, limit);
      return NextResponse.json(result);
    }

    const result = await getFollowingFeedWithReposts(user.id, cursorParam, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Feed] Error:', err);
    return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 });
  }
}
