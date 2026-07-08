export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getUnreadCount } from '@/lib/social';
import { getTotalUnreadCount } from '@/lib/messaging';

// GET /api/notifications/unread-counts
// Cheap, poll-friendly endpoint (two indexed COUNT queries) for the
// navbar's notification + messages badges. Deliberately separate from
// /api/social/notifications and /api/messages/conversations, which return
// full payloads and are too heavy to poll every few seconds.
export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ notifications: 0, messages: 0 });

    const [notifications, messages] = await Promise.all([
      getUnreadCount(user.id),
      getTotalUnreadCount(user.id),
    ]);

    return NextResponse.json({ notifications, messages });
  } catch (err) {
    console.error('[unread-counts] GET error:', err);
    return NextResponse.json({ notifications: 0, messages: 0 });
  }
}
