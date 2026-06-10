// src/app/api/marketplace/checkout/notify/route.ts
// PayFast ITN webhook — activates a marketplace order on confirmed payment.
// m_payment_id = MarketplaceOrder.id (status: 'pending' → 'active')

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validatePayFastITN, PAYFAST_IPS } from '@/lib/payfast';
import { platformFee as calcFee, artistNet as calcNet } from '@/lib/plans';

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') || '';

  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  if (!isSandbox && !PAYFAST_IPS.includes(clientIp)) {
    console.error('[marketplace/notify] Blocked unknown IP:', clientIp);
    return new NextResponse('Forbidden', { status: 403 });
  }

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  if (!isSandbox && !validatePayFastITN(data, passphrase)) {
    console.error('[marketplace/notify] ITN signature invalid');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  if (data.payment_status !== 'COMPLETE') {
    if (data.m_payment_id && ['FAILED', 'CANCELLED'].includes(data.payment_status)) {
      await prisma.marketplaceOrder.updateMany({
        where: { id: data.m_payment_id, status: 'pending' },
        data:  { status: 'cancelled' },
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  const orderId    = data.m_payment_id;
  const pfPaymentId = data.pf_payment_id;
  const amountGross = parseFloat(data.amount_gross ?? '0');
  const artistId   = data.custom_str3;

  try {
    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      console.warn('[marketplace/notify] Order not found:', orderId);
      return NextResponse.json({ ok: true });
    }
    if (order.status !== 'pending') {
      console.info('[marketplace/notify] Duplicate ITN ignored — order already active:', orderId);
      return NextResponse.json({ ok: true });
    }

    // Activate the order
    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data:  { status: 'active' },
    });

    // Increment artist's total orders on the service
    await prisma.marketplaceService.update({
      where: { id: order.serviceId },
      data:  { totalOrders: { increment: 1 } },
    }).catch(() => {});

    // Resolve artist plan for correct fee calculation
    const artist = await prisma.artist.findUnique({
      where:  { id: artistId },
      select: { planSlug: true, planExpiresAt: true },
    });

    const fee = calcFee(amountGross, artist?.planSlug, artist?.planExpiresAt);
    const net = calcNet(amountGross, artist?.planSlug, artist?.planExpiresAt);

    // Queue artist payout — held until order is marked complete
    await prisma.artistPayout.create({
      data: {
        artistId,
        amount:    net,
        method:    'payfast',
        currency:  'ZAR',
        status:    'pending',
        reference: pfPaymentId,
        notes:     `Marketplace order ${orderId} — held pending delivery (fee: R${fee.toFixed(2)} kept by Vuka)`,
      },
    });

    // Record revenue for admin finance
    await prisma.purchase.create({
      data: {
        itemType:           'marketplace',
        buyerEmail:         data.email_address || '',
        buyerName:          `${data.name_first || ''} ${data.name_last || ''}`.trim() || 'Client',
        amount:             amountGross,
        currency:           'ZAR',
        platformFee:        fee,
        netAmount:          net,
        status:             'confirmed',
        payfastPfPaymentId: pfPaymentId,
        downloadToken:      `marketplace-${pfPaymentId}`,
      },
    });

    console.info('[marketplace/notify] Order activated:', orderId);
  } catch (err) {
    console.error('[marketplace/notify] Error:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}
