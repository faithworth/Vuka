export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { repost } from '@/lib/social';

// POST /api/social/reposts
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { targetType, targetId, note } = await req.json();
    if (!targetType || !targetId) {
      return NextResponse.json({ error: 'targetType and targetId required' }, { status: 400 });
    }

    const result = await repost(user.id, targetType, targetId, note ?? '');
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Reposts] Error:', err);
    return NextResponse.json({ error: 'Failed to repost' }, { status: 500 });
  }
}
