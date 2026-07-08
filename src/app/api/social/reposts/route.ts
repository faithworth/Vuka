export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { toggleRepost, getBulkRepostStatus } from '@/lib/social';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// GET /api/social/reposts?targetType=post&targetIds=id1,id2,id3 — bulk status
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ reposted: {} });

    const targetType = req.nextUrl.searchParams.get('targetType');
    const targetIdsParam = req.nextUrl.searchParams.get('targetIds');
    if (!targetType || !targetIdsParam) return NextResponse.json({ reposted: {} });

    const targetIds = targetIdsParam.split(',').filter(Boolean).slice(0, 100);
    const reposted = await getBulkRepostStatus(user.id, targetType, targetIds);
    return NextResponse.json({ reposted });
  } catch (err) {
    console.error('[Reposts] Bulk status error:', err);
    return NextResponse.json({ reposted: {} });
  }
}

// POST /api/social/reposts — toggle repost on/off
// Body: { targetType, targetId, note? }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.repost_action, ip);
    if (limited) return NextResponse.json({ error: 'Too many actions — please slow down' }, { status: 429 });

    const { targetType, targetId, note } = await req.json();
    if (!targetType || !targetId) {
      return NextResponse.json({ error: 'targetType and targetId required' }, { status: 400 });
    }

    const result = await toggleRepost(user.id, targetType, targetId, note ?? '');
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Reposts] Error:', err);
    return NextResponse.json({ error: 'Failed to repost' }, { status: 500 });
  }
}
