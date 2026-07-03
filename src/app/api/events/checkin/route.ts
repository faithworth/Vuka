/**
 * POST /api/events/checkin
 *
 * Door-staff-only. Scans a ticket's qrToken and admits (or rejects) the
 * holder. This is the actual anti-fraud enforcement point — everything
 * else (unguessable tokens, signatures) exists to make sure this endpoint
 * has something trustworthy to check.
 *
 * Auth: the artist who owns the event, or a platform admin. A fan can
 * never call this even if they somehow found the URL — there's no path
 * from "having a ticket" to "being allowed to check tickets in".
 *
 * The actual claim is a single conditional UPDATE — checkedInAt is only
 * set if it was still NULL — so two doormen scanning the same QR at the
 * same instant can't both succeed. Whoever's request lands first wins;
 * the second gets "already used" with the first scan's timestamp.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { verifyTicketSignature } from '@/lib/ticket-security';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { qrToken, eventId } = await req.json().catch(() => ({}));
  if (!qrToken || !eventId) return NextResponse.json({ error: 'Missing qrToken or eventId' }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, artistId: true, title: true } });
  if (!event) return NextResponse.json({ result: 'invalid', reason: 'Event not found' }, { status: 404 });

  const isOwner = user.artist?.id === event.artistId;
  const adminRoles = ['owner', 'super_admin', 'admin', 'moderator'];
  const isAdmin = adminRoles.includes(user.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Not authorized to scan tickets for this event' }, { status: 403 });
  }

  const ticket = await prisma.ticketPurchase.findUnique({
    where: { qrToken },
    include: { ticket: { select: { name: true } } },
  });

  if (!ticket) {
    logger.warn('[events/checkin] Unknown qrToken', { traceId: 'gate', eventId, scannedBy: user.id });
    return NextResponse.json({ result: 'invalid', reason: 'Ticket not found — not a real Vuka ticket' }, { status: 404 });
  }

  if (ticket.eventId !== eventId) {
    return NextResponse.json({ result: 'wrong_event', reason: 'This ticket is for a different event' }, { status: 409 });
  }

  if (ticket.status !== 'confirmed') {
    return NextResponse.json({ result: 'unpaid', reason: `Ticket status is '${ticket.status}', not paid/confirmed` }, { status: 409 });
  }

  if (!verifyTicketSignature(ticket.id, ticket.qrToken, ticket.qrSignature)) {
    logger.error('[events/checkin] Signature mismatch — possible tampered/forged ticket row', { ticketId: ticket.id, eventId, scannedBy: user.id });
    return NextResponse.json({ result: 'invalid', reason: 'Ticket failed integrity check' }, { status: 409 });
  }

  if (ticket.checkedInAt) {
    return NextResponse.json({
      result: 'already_used',
      reason: `Already scanned at ${ticket.checkedInAt.toISOString()}`,
      buyerName: ticket.buyerName,
      checkedInAt: ticket.checkedInAt,
    }, { status: 409 });
  }

  // Atomic claim — succeeds only if still unclaimed at the moment of update.
  const claim = await prisma.ticketPurchase.updateMany({
    where: { id: ticket.id, checkedInAt: null, status: 'confirmed' },
    data: { checkedInAt: new Date(), checkedInByUserId: user.id },
  });

  if (claim.count === 0) {
    // Someone else's scan won the race in the microseconds since we checked.
    const fresh = await prisma.ticketPurchase.findUnique({ where: { id: ticket.id }, select: { checkedInAt: true, buyerName: true } });
    return NextResponse.json({
      result: 'already_used',
      reason: `Already scanned at ${fresh?.checkedInAt?.toISOString()}`,
      buyerName: fresh?.buyerName,
      checkedInAt: fresh?.checkedInAt,
    }, { status: 409 });
  }

  logger.info('[events/checkin] Admitted', { ticketId: ticket.id, eventId, scannedBy: user.id });
  return NextResponse.json({
    result: 'admit',
    buyerName: ticket.buyerName,
    ticketName: ticket.ticket.name,
  });
}
