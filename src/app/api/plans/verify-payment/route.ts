// src/app/api/plans/verify-payment/route.ts
//
// Called by the settings page when Paystack redirects back with ?plan_activated=1
// and a `reference` query param.  Verifies the transaction directly with Paystack
// and upgrades the artist's plan — acts as a client-side fallback for when the
// webhook hasn't fired yet (test mode, localhost, or webhook delay).
//
// Idempotent — safe to call multiple times for the same reference.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { verifyTransaction } from '@/lib/paystack';
import { PLANS } from '@/lib/plans';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { reference } = await req.json();
    if (!reference || !reference.startsWith('PLAN_')) {
      return NextResponse.json({ error: 'Invalid reference' }, { status: 400 });
    }

    // Idempotency — already processed by webhook
    const already = await prisma.artistPlanSubscription.findFirst({
      where: { paystackReference: reference },
    });
    if (already) {
      logger.info('[plans/verify-payment] Already processed by webhook', { reference });
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    // Verify directly with Paystack
    const verification = await verifyTransaction(reference);
    if (verification.status !== 'success') {
      return NextResponse.json({ error: 'Payment not successful', status: verification.status }, { status: 402 });
    }

    // Extract planSlug from metadata
    const planSlug = verification.metadata?.planSlug as string | undefined;
    if (!planSlug) {
      return NextResponse.json({ error: 'Missing planSlug in payment metadata' }, { status: 400 });
    }

    const plan = PLANS.find(p => p.slug === planSlug);
    if (!plan || plan.priceZAR === 0) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Verify this payment belongs to this artist
    const artistId = user.artist.id;

    const now       = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.artist.update({
      where: { id: artistId },
      data:  { planSlug, planExpiresAt: periodEnd },
    });

    await prisma.artistPlanSubscription.create({
      data: {
        artistId,
        planSlug,
        status:             'active',
        paystackReference:  reference,
        amount:             plan.priceZAR,
        currency:           'ZAR',
        billingInterval:    'monthly',
        currentPeriodStart: now,
        currentPeriodEnd:   periodEnd,
      },
    });

    logger.info('[plans/verify-payment] Plan activated via client verify', { artistId, planSlug, reference });
    return NextResponse.json({ ok: true, planSlug, planExpiresAt: periodEnd });

  } catch (err: any) {
    logger.error('[plans/verify-payment] Error', { error: err?.message });
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
