export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PLANS } from '@/lib/plans';
import { createYocoCheckout, generateReference } from '@/lib/yoco';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { activatePlanPayment } from '@/lib/plan-payments';

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limited = await rateLimit(getClientIp(req.headers), RATE_LIMITS.checkout_init, getClientIp(req.headers));
    if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

    const { planSlug } = await req.json();
    const plan = PLANS.find(p => p.slug === planSlug);
    if (!plan || plan.priceZAR <= 0) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
    const reference = generateReference('PLAN_YOCO');

    const existing = await (prisma as any).artistPlanSubscription.findFirst({
      where: { artistId: user.artist.id, status: 'active', currentPeriodEnd: { gt: new Date() } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (existing && existing.planSlug === planSlug) {
      return NextResponse.json({ error: 'This plan is already active.' }, { status: 409 });
    }

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
      const checkout = await createYocoCheckout({
        amountZAR: plan.priceZAR,
        currency: 'ZAR',
        reference,
        successUrl: `${appUrl}/dashboard/settings?plan_activated=1&provider=yoco&ref=${encodeURIComponent(reference)}`,
        cancelUrl: `${appUrl}/dashboard/settings#billing`,
        failureUrl: `${appUrl}/dashboard/settings#billing`,
        metadata: { purchaseId: purchase.id, reference, type: 'plan_subscription', artistId: user.artist.id, planSlug },
      });

      return NextResponse.json({ redirectUrl: checkout.redirectUrl, reference });
    } catch (err) {
      await prisma.purchase.delete({ where: { id: purchase.id } }).catch(() => {});
      console.error('[plans/subscribe-yoco] checkout failed', err);
      return NextResponse.json({ error: 'Yoco could not start the payment. Please try another payment method.' }, { status: 502 });
    }
  } catch (err) {
    console.error('[plans/subscribe-yoco] error', err);
    return NextResponse.json({ error: 'Failed to initiate Yoco payment' }, { status: 500 });
  }
}
