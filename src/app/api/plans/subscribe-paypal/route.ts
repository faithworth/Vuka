export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import paypal, { isPayPalConfigured, getApproveUrl } from '@/lib/paypal';
import { getZarToUsdRate, zarToUsd } from '@/lib/fx';
import { PLANS } from '@/lib/plans';
import { activatePlanPayment } from '@/lib/plan-payments';

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isPayPalConfigured()) return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 });

    const { planSlug } = await req.json();
    const plan = PLANS.find(p => p.slug === planSlug);
    if (!plan || plan.priceZAR <= 0) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    const existing = await (prisma as any).artistPlanSubscription.findFirst({
      where: { artistId: user.artist.id, status: 'active', currentPeriodEnd: { gt: new Date() } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (existing && existing.planSlug === planSlug) {
      return NextResponse.json({ error: 'This plan is already active.' }, { status: 409 });
    }

    const fx = await getZarToUsdRate();
    const amountUSD = zarToUsd(plan.priceZAR, fx.zarToUsdRate);
    if (amountUSD < 0.01) return NextResponse.json({ error: 'Plan amount is below PayPal minimum.' }, { status: 400 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
    const reference = `PLAN_PAYPAL_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2,7).toUpperCase()}`;

    const purchase = await prisma.purchase.create({
      data: {
        userId: user.id,
        artistId: user.artist.id,
        itemType: 'subscription',
        amount: plan.priceZAR,
        currency: 'ZAR',
        licenseType: planSlug,
        licenseId: reference,
        paystackReference: reference,
        status: 'pending',
      },
    });

    try {
      const order = await paypal.orders.create({
        amountUSD,
        items: [{ name: `Vuka Music ${plan.name} Plan`, description: `Vuka ${plan.name} artist plan — ${plan.billingPeriod === 'EVERY_2_MONTHS' ? '2 months' : 'annual'}`, amountUSD }],
        returnUrl: `${appUrl}/api/plans/paypal/capture?purchaseId=${purchase.id}`,
        cancelUrl: `${appUrl}/dashboard/settings#billing`,
        reference,
        buyerEmail: user.email,
      }, `vuka-plan-${purchase.id}`);

      const approveUrl = getApproveUrl(order);
      if (!approveUrl) throw new Error('PayPal did not return an approval URL');

      await prisma.purchase.update({ where: { id: purchase.id }, data: { paystackReference: reference } });
      return NextResponse.json({ approveUrl, amountUSD, priceZAR: plan.priceZAR, reference });
    } catch (err) {
      await prisma.purchase.delete({ where: { id: purchase.id } }).catch(() => {});
      console.error('[plans/subscribe-paypal] order failed', err);
      return NextResponse.json({ error: 'PayPal could not start the payment. Please try another payment method.' }, { status: 502 });
    }
  } catch (err) {
    console.error('[plans/subscribe-paypal] error', err);
    return NextResponse.json({ error: 'Failed to initiate PayPal payment' }, { status: 500 });
  }
}
