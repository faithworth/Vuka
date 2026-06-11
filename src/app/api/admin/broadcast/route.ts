/**
 * Admin Broadcast Email — Phase 9
 * POST /api/admin/broadcast
 * Sends a broadcast message to all users or a filtered segment.
 *
 * Body: {
 *   subject: string
 *   title: string
 *   body: string
 *   ctaLabel?: string
 *   ctaUrl?: string
 *   filter?: {
 *     roles?: string[]   // e.g. ['artist', 'producer', 'fan']
 *     country?: string   // e.g. 'ZA'
 *   }
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendBroadcast } from '@/lib/emails';
import { requireAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { subject, title, body: msgBody, ctaLabel, ctaUrl, filter } = body;

  if (!subject || !title || !msgBody) {
    return NextResponse.json({ error: 'subject, title, and body are required' }, { status: 400 });
  }

  // Build user query — only valid User model fields
  const where: any = { isSuspended: false };
  if (filter?.roles?.length) where.role = { in: filter.roles };
  if (filter?.country) where.country = filter.country;

  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true, name: true },
  });

  if (users.length === 0) {
    return NextResponse.json({ error: 'No users match the filter' }, { status: 400 });
  }

  // Log the broadcast first
  await prisma.broadcastLog.create({
    data: {
      sentBy: adminCheck.id,
      subject,
      title,
      body: msgBody,
      ctaLabel: ctaLabel || null,
      ctaUrl: ctaUrl || null,
      recipientCount: users.length,
      filter: filter || null,
    },
  });

  // Send in batches of 10 to avoid rate limits
  const batchSize = 10;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (user) => {
        try {
          await sendBroadcast({
            to: user.email,
            displayName: user.name,
            subject,
            title,
            body: msgBody,
            ctaLabel,
            ctaUrl,
          });
          sent++;
        } catch (err: any) {
          failed++;
          errors.push(`${user.email}: ${err.message}`);
        }
      })
    );
    // Throttle between batches
    if (i + batchSize < users.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return NextResponse.json({
    success: true,
    totalUsers: users.length,
    sent,
    failed,
    errors: errors.slice(0, 20),
  });
}

// GET: list past broadcasts
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const broadcasts = await prisma.broadcastLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ broadcasts });
}
