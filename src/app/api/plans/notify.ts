// ============================================================
// src/app/api/plans/notify/route.ts
// PayFast ITN webhook for Vuka plan subscription payments.
// Activates Pro or Label plan on confirmed payment.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validatePayFastITN, PAYFAST_IPS } from '@/lib/payfast';
import { PLANS } from '@/lib/plans';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  if (!isSandbox && !PAYFAST_IPS.includes(clientIp)) {
    logger.warn('[plans/notify] Blocked unknown IP', { clientIp });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  if (!isSandbox && !validatePayFastITN(data, passphrase)) {
    logger.error('[plans/notify] ITN signature invalid', { clientIp });
    return new NextResponse('Invalid signature', { status: 400 });
  }

  if (data.payment_status !== 'COMPLETE') {
    return NextResponse.json({ ok: true });
  }

  const artistId   = data.custom_str1;
  const planSlug   = data.custom_str2;
  const paymentRef = data.m_payment_id;
  const pfPaymentId = data.pf_payment_id;

  if (!artistId || !planSlug) {
    logger.warn('[plans/notify] Missing custom fields', { artistId, planSlug });
    return NextResponse.json({ ok: true });
  }

  const plan = PLANS.find(p => p.slug === planSlug);
  if (!plan || plan.priceZAR === 0) {
    logger.warn('[plans/notify] Invalid plan in ITN', { planSlug });
    return NextResponse.json({ ok: true });
  }

  try {
    // Idempotency: check if this payment ref already activated a plan
    const already = await (prisma as any).artistPlanSubscription.findFirst({
      where: { payfastPaymentId: pfPaymentId },
    });
    if (already) {
      logger.info('[plans/notify] Duplicate ITN — already processed', { pfPaymentId });
      return NextResponse.json({ ok: true });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Activate the plan on the artist
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        planSlug,
        planExpiresAt: periodEnd, // expires in 1 month; cron will drop to free if not renewed
      },
    });

    // Record the subscription
    await (prisma as any).artistPlanSubscription.create({
      data: {
        artistId,
        planSlug,
        status: 'active',
        payfastPaymentId: pfPaymentId,
        amount: plan.priceZAR,
        currency: 'ZAR',
        billingInterval: 'monthly',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // Record as a Purchase so admin/finance overview includes subscription revenue
    await prisma.purchase.create({
      data: {
        itemType:          'subscription',
        buyerEmail:        data.custom_str3 || '',
        buyerName:         `${data.name_first || ''} ${data.name_last || ''}`.trim() || 'Artist',
        amount:            plan.priceZAR,
        currency:          'ZAR',
        platformFee:       plan.priceZAR, // 100% kept by Vuka — this is the platform fee itself
        netAmount:         0,
        status:            'confirmed',
        payfastPfPaymentId: pfPaymentId,
        downloadToken:     `plan-${pfPaymentId}`,
      },
    }).catch(() => {}); // non-blocking — plan activation already succeeded

    await auditLog.adminAction(
      'plan.activated',
      'Artist',
      artistId,
      'system',
      `Plan ${planSlug} activated via PayFast payment ${pfPaymentId}`,
    );

    logger.info('[plans/notify] Plan activated', { artistId, planSlug, pfPaymentId });
  } catch (err) {
    logger.error('[plans/notify] Error activating plan', {
      artistId, planSlug,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true });
}
