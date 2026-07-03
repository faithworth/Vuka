export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { initializeTransaction, generateReference } from '@/lib/paystack';
import { generateQrToken, signTicket } from '@/lib/ticket-security';

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  const body = await req.json();
  const { eventId, ticketId, quantity, buyerName, buyerEmail } = body;
  if (!eventId || !ticketId || !buyerName || !buyerEmail)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  const qty = Math.max(1, parseInt(quantity) || 1);
  const ticket = await prisma.eventTicket.findUnique({ where: { id: ticketId }, include: { event: true } });
  if (!ticket || ticket.eventId !== eventId) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  if (ticket.event.status !== 'published') return NextResponse.json({ error: 'Event not available' }, { status: 400 });
  // Check availability
  const soldAgg = await prisma.ticketPurchase.aggregate({
    _sum: { quantity: true }, where: { ticketId, status: 'confirmed' },
  });
  const sold = soldAgg._sum.quantity ?? 0;
  if (ticket.quantity && sold + qty > ticket.quantity)
    return NextResponse.json({ error: 'Not enough tickets available' }, { status: 400 });
  const totalAmount = ticket.price * qty;

  // One Paystack charge for the whole group, but one *unique, individually
  // scannable* row per ticket — buying 3 must never mean 3 people share
  // one QR code. Each row gets its own crypto-random qrToken and its own
  // HMAC signature (src/lib/ticket-security.ts), and each has its own
  // independent checkedInAt, so admitting one person never admits another.
  const ref = generateReference('TICKET');
  const rows = Array.from({ length: qty }, () => {
    const qrToken = generateQrToken();
    return { qrToken, qrSignature: '' as string, id: '' as string };
  });

  const created = await prisma.$transaction(
    rows.map(r => prisma.ticketPurchase.create({
      data: {
        eventId, ticketId,
        userId: user?.id ?? null, buyerName, buyerEmail,
        quantity: 1, unitPrice: ticket.price, totalAmount: ticket.price,
        currency: 'ZAR', status: 'pending',
        qrToken: r.qrToken,
        paystackReference: ref,
      },
    }))
  );

  // Sign each row now that we have its real id (signature covers id+token,
  // so it has to happen after creation).
  await prisma.$transaction(
    created.map(row => prisma.ticketPurchase.update({
      where: { id: row.id },
      data: { qrSignature: signTicket(row.id, row.qrToken) },
    }))
  );

  if (ticket.price === 0) {
    // Free tickets — confirm all rows immediately, no payment step, but
    // still email the QR codes; a "free" ticket still needs to admit
    // people at the gate the same as a paid one.
    await prisma.ticketPurchase.updateMany({
      where: { id: { in: created.map(r => r.id) } },
      data: { status: 'confirmed' },
    });
    await prisma.eventTicket.update({ where: { id: ticketId }, data: { sold: { increment: qty } } });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
    const { sendTicketConfirmation } = await import('@/lib/emails');
    await sendTicketConfirmation({
      to: buyerEmail, buyerName,
      eventTitle: ticket.event.title, eventVenue: ticket.event.venue, eventCity: ticket.event.city,
      eventStartDate: ticket.event.startDate, ticketName: ticket.name, quantity: qty,
      amount: 0, currency: 'ZAR',
      ticketUrls: created.map(r => `${appUrl}/tickets/${r.qrToken}`),
    }).catch(() => {});

    return NextResponse.json({ ok: true, free: true, purchases: created });
  }

  // Paid — one Paystack charge for the group total; the webhook confirms
  // every row sharing this reference at once (see handleTicketEvent).
  const ps = await initializeTransaction({
    email: buyerEmail, amountZAR: totalAmount, reference: ref,
    metadata: { type: 'ticket', eventId, ticketId, quantity: qty },
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/events/${ticket.event.slug}?ticket_success=1`,
  });
  if (!ps.authorizationUrl) return NextResponse.json({ error: 'Payment init failed' }, { status: 500 });
  return NextResponse.json({ ok: true, authorizationUrl: ps.authorizationUrl, reference: ref });
}
