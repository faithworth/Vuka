export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import paypal from '@/lib/paypal';
import { PLANS } from '@/lib/plans';
import { getZarToUsdRate, zarToUsd } from '@/lib/fx';
import { activatePlanPayment } from '@/lib/plan-payments';

export async function GET(req: NextRequest) {
  const purchaseId = new URL(req.url).searchParams.get('purchaseId');
  if (!purchaseId) return NextResponse.redirect(new URL('/dashboard/settings?plan_error=missing', req.url));

  try {
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase?.artistId || purchase.itemType !== 'subscription' || !purchase.paystackReference?.startsWith('PLAN_PAYPAL_')) {
      return NextResponse.redirect(new URL('/dashboard/settings?plan_error=invalid', req.url));
    }

    const existing = await (prisma as any).artistPlanSubscription.findFirst({ where: { paystackReference: purchase.paystackReference } });
    if (existing) return NextResponse.redirect(new URL('/dashboard/settings?plan_activated=1&provider=paypal', req.url));

    const orderId = new URL(req.url).searchParams.get('token');
    if (!orderId) return NextResponse.redirect(new URL('/dashboard/settings?plan_error=missing_token', req.url));

    const captured = await paypal.orders.capture(orderId, `vuka-plan-capture-${purchase.id}`);
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture || capture.status !== 'COMPLETED') {
      return NextResponse.redirect(new URL('/dashboard/settings?plan_error=payment_failed', req.url));
    }

    const planSlug = purchase.licenseType;
    const plan = PLANS.find(p => p.slug === planSlug);
    if (!plan) throw new Error('Invalid stored plan');

    const fx = await getZarToUsdRate();
    const expectedUSD = zarToUsd(plan.priceZAR, fx.zarToUsdRate);
    const paidUSD = Number(capture.amount.value);
    // Allow a small FX movement between order creation and capture, but never a material underpayment.
    if (paidUSD + 0.02 < expectedUSD) throw new Error('PayPal amount mismatch');

    await activatePlanPayment({
      artistId: purchase.artistId,
      planSlug,
      reference: purchase.paystackReference,
      amountZAR: plan.priceZAR,
      currency: 'ZAR',
      provider: 'paypal',
    });

    await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'confirmed', paypalCaptureId: capture.id } });
    return NextResponse.redirect(new URL('/dashboard/settings?plan_activated=1&provider=paypal', req.url));
  } catch (err) {
    console.error('[plans/paypal/capture] error', err);
    return NextResponse.redirect(new URL('/dashboard/settings?plan_error=payment_failed', req.url));
  }
}
