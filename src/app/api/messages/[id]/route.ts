export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getMessages, sendMessage, deleteMessage } from '@/lib/messaging';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import prisma from '@/lib/prisma';

// GET /api/messages/[id]?cursor=ISO_DATE&limit=50
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 100);

    const result = await getMessages(params.id, user.id, cursor, limit);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load messages';
    const status = msg === 'Unauthorized' ? 403 : msg === 'Conversation not found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// POST /api/messages/[id] — send a message into this conversation
// Body: { body: string, attachments?: [...] }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.message_send, ip);
    if (limited) return NextResponse.json({ error: 'Too many messages — please slow down' }, { status: 429 });

    // Resolve the recipient from the conversation
    const conv = await prisma.messageConversation.findUnique({ where: { id: params.id } });
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const c = conv as { participant1: string; participant2: string };
    if (c.participant1 !== user.id && c.participant2 !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const recipientId = c.participant1 === user.id ? c.participant2 : c.participant1;

    const body = await req.json();
    const message = await sendMessage({
      senderId: user.id,
      recipientId,
      body: body.body ?? '',
      attachments: body.attachments,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send message';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/messages/[id]?messageId=xxx
export async function DELETE(
  req: NextRequest,
  { params: _params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const messageId = req.nextUrl.searchParams.get('messageId');
    if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

    await deleteMessage(messageId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete message';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
