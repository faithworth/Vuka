export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { toggleSave, getUserSaves } from '@/lib/social';

// GET /api/social/saves?targetType=beat&page=1
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const targetType = req.nextUrl.searchParams.get('targetType') ?? undefined;
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
