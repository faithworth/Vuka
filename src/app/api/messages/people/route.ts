export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getMessageablePeople } from '@/lib/messaging';

// GET /api/messages/people?q=search&tab=all|artists|industry|fans|following&limit=30
// Powers the Messenger "New Message" picker — every person on Vuka the
// current user can start (or resume) a conversation with.
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const q = req.nextUrl.searchParams.get('q') ?? undefined;
    const tabParam = req.nextUrl.searchParams.get('tab') ?? 'all';
    const tab = (['all', 'artists', 'industry', 'fans', 'following'].includes(tabParam)
      ? tabParam
      : 'all') as 'all' | 'artists' | 'industry' | 'fans' | 'following';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '30'), 60);

    const result = await getMessageablePeople(user.id, { q, tab, limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Messages/People] GET error:', err);
    return NextResponse.json({ error: 'Failed to load people' }, { status: 500 });
  }
}
