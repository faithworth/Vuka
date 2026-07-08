export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { toggleLike, getBulkLikeStatus } from '@/lib/social';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// POST /api/social/likes — toggle like
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.like_toggle, ip);
    if (limited) return NextResponse.json({ error: 'Too many actions — please slow down' }, { status: 429 });

    const { targetType, targetId } = await req.json();
    if (!targetType || !targetId) {
      return NextResponse.json({ error: 'targetType and targetId required' }, { status: 400 });
    }

    const result = await toggleLike(user.id, targetType, targetId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Likes] Toggle error:', err);
    return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
  }
}

// GET /api/social/likes?targetType=beat&targetIds=id1,id2,id3
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ liked: {} });

    const targetType = req.nextUrl.searchParams.get('targetType');
    const targetIdsParam = req.nextUrl.searchParams.get('targetIds');
    if (!targetType || !targetIdsParam) return NextResponse.json({ liked: {} });

    const targetIds = targetIdsParam.split(',').filter(Boolean).slice(0, 100);
    const liked = await getBulkLikeStatus(user.id, targetIds.map(id => ({ type: targetType as 'beat' | 'release' | 'post' | 'comment', id })));
    return NextResponse.json({ liked });
  } catch (err) {
    console.error('[Likes] Bulk status error:', err);
    return NextResponse.json({ liked: {} });
  }
}
