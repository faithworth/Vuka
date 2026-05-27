export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getModerationQueue } from '@/lib/moderation';

// GET /api/moderation/queue?status=pending&category=spam&page=1&limit=30
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status') ?? 'pending';
    const category = req.nextUrl.searchParams.get('category') ?? undefined;
    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '30'), 50);

    const result = await getModerationQueue(status, category, page, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Moderation/Queue] Error:', err);
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 });
  }
}
