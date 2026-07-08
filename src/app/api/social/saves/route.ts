export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { toggleSave, getUserSaves, getBulkSaveStatus } from '@/lib/social';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// GET /api/social/saves?targetType=post&targetIds=id1,id2 — bulk status (feed save icons)
// GET /api/social/saves?targetType=beat&page=1           — paginated saved-items listing
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const targetType = req.nextUrl.searchParams.get('targetType') ?? undefined;
    const targetIdsParam = req.nextUrl.searchParams.get('targetIds');

    if (targetType && targetIdsParam) {
      const targetIds = targetIdsParam.split(',').filter(Boolean).slice(0, 100);
      const saved = await getBulkSaveStatus(user.id, targetType, targetIds);
      return NextResponse.json({ saved });
    }

    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    const result = await getUserSaves(user.id, targetType, page, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Saves] GET error:', err);
    return NextResponse.json({ error: 'Failed to get saves' }, { status: 500 });
  }
}

// POST /api/social/saves
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

    const result = await toggleSave(user.id, targetType, targetId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Saves] Toggle error:', err);
    return NextResponse.json({ error: 'Failed to toggle save' }, { status: 500 });
  }
}
