export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getConversations, getOrCreateConversation, archiveConversation } from '@/lib/messaging';

// GET /api/messages/conversations?page=1&limit=30
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '30'), 50);

    const result = await getConversations(user.id, page, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Messages/Conversations] GET error:', err);
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }
}

// POST /api/messages/conversations — get or create conversation with another user
// Body: { recipientId: string }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { recipientId } = await req.json();
    if (!recipientId) return NextResponse.json({ error: 'recipientId required' }, { status: 400 });
    if (recipientId === user.id) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 });

    const conv = await getOrCreateConversation(user.id, recipientId);
    return NextResponse.json({ conversation: conv });
  } catch (err) {
    console.error('[Messages/Conversations] POST error:', err);
    return NextResponse.json({ error: 'Failed to open conversation' }, { status: 500 });
  }
}

// PATCH /api/messages/conversations — archive a conversation
// Body: { conversationId: string }
export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversationId } = await req.json();
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    await archiveConversation(conversationId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to archive conversation';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
