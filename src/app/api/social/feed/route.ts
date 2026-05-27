export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getUserFeed } from '@/lib/social';

// GET /api/social/feed?cursor=ISO_DATE&limit=20
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    const { items, nextCursor } = await getUserFeed(user.id, cursor, limit);
    return NextResponse.json({ items, nextCursor });
  } catch (err) {
    console.error('[Feed] Error:', err);
    return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 });
  }
}
