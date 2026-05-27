export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import {
  getNotifications, markNotificationsRead, createNotification
} from '@/lib/social';
import prisma from '@/lib/prisma';

// GET /api/social/notifications?page=1&unreadOnly=false
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '30');
    const unreadOnly = req.nextUrl.searchParams.get('unreadOnly') === 'true';

    const result = await getNotifications(user.id, page, limit, unreadOnly);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Notifications] GET error:', err);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}

// PATCH /api/social/notifications — mark read
// Body: { ids?: string[] }  (empty = mark all read)
export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await markNotificationsRead(user.id, body.ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Notifications] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to mark notifications' }, { status: 500 });
  }
}

// GET /api/social/notifications/preferences  — via ?action=prefs
// PATCH /api/social/notifications            — update prefs via body.prefs
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    if (body.action === 'get_prefs') {
      const prefs = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
      return NextResponse.json({ prefs });
    }

    if (body.action === 'update_prefs' && body.prefs) {
      const updated = await prisma.notificationPreference.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...body.prefs },
        update: body.prefs,
      });
      return NextResponse.json({ prefs: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[Notifications] POST error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
