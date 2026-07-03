export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { initializeTransaction } from '@/lib/paystack';

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
  // Create pending purchase
  const purchase = await prisma.ticketPurchase.create({
    data: {
      id: `tp_${Date.now()}`, eventId, ticketId,
      userId: user?.id ?? null, buyerName, buyerEmail,
      quantity: qty, unitPrice: ticket.price, totalAmount,
      currency: 'ZAR', status: 'pending',
      qrToken: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  if (ticket.price === 0) {
    // Free ticket — confirm immediately
    await prisma.ticketPurchase.update({ where: { id: purchase.id }, data: { status: 'confirmed' } });
    return NextResponse.json({ ok: true, free: true, purchase });
  }
  // Paid ticket — init Paystack
  const ref = `ticket_${purchase.id}`;
  // FIX: paystackReference was never persisted, so the webhook had no way
  // to find this row later — paid tickets stayed 'pending' forever even
  // after a successful charge. Store it before initializing the charge.
  await prisma.ticketPurchase.update({ where: { id: purchase.id }, data: { paystackReference: ref } });
  const ps = await initializeTransaction({
    email: buyerEmail, amountZAR: totalAmount * 100 / 100, reference: ref, metadata: { type: 'ticket', purchaseId: purchase.id, eventId, ticketId }, callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/events/${ticket.event.slug}?ticket_success=1`,
  });
  if (!ps.authorizationUrl) return NextResponse.json({ error: 'Payment init failed' }, { status: 500 });
  return NextResponse.json({ ok: true, authorizationUrl: ps.authorizationUrl, reference: ref });
}
