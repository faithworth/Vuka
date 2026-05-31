// src/app/api/social/notifications/route.ts
// GET  — fetch user notifications (most recent first)
// PATCH — mark as read: { ids: string[] } for specific, or no body for all

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get('limit') ?? '30'),
      100
    );

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        isRead: true,
        createdAt: true,
        linkType: true,
        linkId: true,
      },
    });

    return NextResponse.json({ notifications });
  } catch (err) {
    console.error('[notifications/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let ids: string[] | undefined;
    try {
      const body = await req.json();
      if (Array.isArray(body?.ids) && body.ids.length > 0) {
        ids = body.ids as string[];
      }
    } catch {
      // No body = mark all
    }

    if (ids && ids.length > 0) {
      // Mark specific notifications read (only ones belonging to this user)
      await prisma.notification.updateMany({
        where: { id: { in: ids }, userId: user.id },
        data: { isRead: true },
      });
    } else {
      // Mark all read
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications/PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
