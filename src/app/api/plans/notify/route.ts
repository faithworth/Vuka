// src/app/api/plans/notify/route.ts
// Paystack webhook — activates artist plan on confirmed charge.success.
// Replaces the PayFast ITN handler at the same path.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPaystackWebhook, verifyTransaction } from '@/lib/paystack';
import { PLANS } from '@/lib/plans';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const traceId   = req.headers.get('x-trace-id') ?? 'no-trace';
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const rawBody   = await req.text();

  if (!verifyPaystackWebhook(rawBody, signature)) {
    logger.warn('[plans/notify] Invalid Paystack signature', { traceId });
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new NextResponse('Bad JSON', { status: 400 }); }

  if (event.event !== 'charge.success') return NextResponse.json({ ok: true });

  const reference = event.data?.reference ?? '';
  if (!reference.startsWith('PLAN_'))  return NextResponse.json({ ok: true });

  const metadata = event.data?.metadata ?? {};
  const artistId = metadata.artistId;
  const planSlug = metadata.planSlug;

  if (!artistId || !planSlug) {
    logger.warn('[plans/notify] Missing metadata', { traceId, reference });
    return NextResponse.json({ ok: true });
  }

  const plan = PLANS.find(p => p.slug === planSlug);
  if (!plan || plan.priceZAR === 0) {
    logger.warn('[plans/notify] Invalid plan', { traceId, planSlug });
    return NextResponse.json({ ok: true });
  }

  try {
    // Idempotency
    const already = await (prisma as any).artistPlanSubscription.findFirst({
      where: { paystackReference: reference },
    });
    if (already) {
      logger.info('[plans/notify] Duplicate — already processed', { traceId, reference });
      return NextResponse.json({ ok: true });
    }

    // Verify with Paystack API
    const verification = await verifyTransaction(reference);
    if (verification.status !== 'success') return NextResponse.json({ ok: true });

    const now       = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.artist.update({
      where: { id: artistId },
      data: { planSlug, planExpiresAt: periodEnd },
    });

    await (prisma as any).artistPlanSubscription.create({
      data: {
        artistId,
        planSlug,
        status:             'active',
        paystackReference:   reference, // column kept for schema compat, stores Paystack ref
        amount:             plan.priceZAR,
        currency:           'ZAR',
        billingInterval:    'monthly',
        currentPeriodStart: now,
        currentPeriodEnd:   periodEnd,
      },
    });

    await auditLog.adminAction('plan.activated', 'Artist', artistId, 'system', `Plan ${planSlug} activated via Paystack ${reference}`);
    logger.info('[plans/notify] Plan activated', { traceId, artistId, planSlug, reference });
  } catch (err) {
    logger.error('[plans/notify] Error activating plan', { traceId, artistId, planSlug, error: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({ ok: true });
}
