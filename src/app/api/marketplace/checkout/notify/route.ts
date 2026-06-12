// src/app/api/marketplace/checkout/notify/route.ts
// Paystack webhook — activates marketplace order on confirmed charge.success.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPaystackWebhook, verifyTransaction } from '@/lib/paystack';
import { platformFee as calcFee, artistNet as calcNet } from '@/lib/plans';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const traceId   = req.headers.get('x-trace-id') ?? 'no-trace';
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const rawBody   = await req.text();

  if (!verifyPaystackWebhook(rawBody, signature)) {
    logger.warn('[marketplace/notify] Invalid signature', { traceId });
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new NextResponse('Bad JSON', { status: 400 }); }

  if (event.event !== 'charge.success') return NextResponse.json({ ok: true });

  const reference = event.data?.reference ?? '';
  if (!reference.startsWith('MKT_')) return NextResponse.json({ ok: true });

  const metadata    = event.data?.metadata ?? {};
  const orderId     = metadata.orderId;
  const artistId    = metadata.artistId;
  const buyerEmail  = metadata.buyerEmail ?? '';

  if (!orderId) return NextResponse.json({ ok: true });

  try {
    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) { logger.warn('[marketplace/notify] Order not found', { traceId, orderId }); return NextResponse.json({ ok: true }); }
    if (order.status !== 'pending') { logger.info('[marketplace/notify] Duplicate', { traceId, orderId }); return NextResponse.json({ ok: true }); }

    // Verify with Paystack
    const verification = await verifyTransaction(reference);
    if (verification.status !== 'success') return NextResponse.json({ ok: true });

    const amountGross = verification.amountZAR;

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { planSlug: true, planExpiresAt: true } });
    const fee = calcFee(amountGross, artist?.planSlug, artist?.planExpiresAt);
    const net = calcNet(amountGross, artist?.planSlug, artist?.planExpiresAt);

    await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { status: 'active' } });
    await prisma.marketplaceService.update({ where: { id: order.serviceId }, data: { totalOrders: { increment: 1 } } }).catch(() => {});

    await prisma.artistPayout.create({
      data: {
        artistId,
        amount:    net,
        method:    'paystack',
        currency:  'ZAR',
        status:    'pending',
        reference,
        notes:     `Marketplace order ${orderId} — held pending delivery (fee: R${fee.toFixed(2)} kept by Vuka)`,
      },
    });

    await prisma.purchase.create({
      data: {
        itemType:           'marketplace',
        artistId,
        buyerEmail,
        buyerName:          event.data?.customer?.first_name ?? 'Client',
        amount:             amountGross,
        currency:           'ZAR',
        platformFee:        fee,
        netAmount:          net,
        status:             'confirmed',
        paystackReference: reference,
        downloadToken:      `marketplace-${reference}`,
      },
    });

    logger.info('[marketplace/notify] Order activated', { traceId, orderId, reference });
  } catch (err) {
    logger.error('[marketplace/notify] Error', { traceId, orderId, error: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({ ok: true });
}
