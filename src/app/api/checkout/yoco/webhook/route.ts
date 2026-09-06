/**
 * POST /api/checkout/yoco/webhook
 *
 * Register via POST /api/admin/yoco/register-webhook (Yoco has no dashboard
 * UI for this). Yoco's public docs describe what look like two different
 * webhook payload shapes across two API surfaces:
 *
 *   Shape A (Checkout-API-specific, older docs):
 *     { id, type: 'payment.succeeded', payload: { id, amount, currency,
 *       status, metadata: { checkoutId, ...whatever we set } } }
 *
 *   Shape B (v1 "Yoco API" subscriptions, newer docs):
 *     { business_id, event_type: 'payment.created', order_id, payment_id }
 *     — no inline amount/metadata; requires a follow-up fetch.
 *
 * We genuinely don't know from public docs alone which one a Checkout
 * created via payments.yoco.com/api/checkouts actually triggers. This
 * handler supports both, and logs the raw payload on every delivery so the
 * first real test transaction tells us definitively — check logs for
 * "[yoco/webhook] RAW PAYLOAD" after a test purchase, then this comment
 * block (and the dead branch) can be deleted once confirmed.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyYocoWebhook, fetchYocoCheckout } from '@/lib/yoco';
import { confirmDirectPurchase } from '@/lib/purchase-confirmation';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? 'no-trace';
  const rawBody = await req.text();

  const verified = verifyYocoWebhook(rawBody, {
    id:        req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
  });

  if (!verified) {
    logger.warn('[yoco/webhook] Invalid signature', { traceId });
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new NextResponse('Bad JSON', { status: 400 }); }

  // TEMPORARY: log every verified delivery's raw shape until we've
  // confirmed which of Shape A / Shape B actually arrives. Remove once
  // confirmed working end-to-end.
  logger.info('[yoco/webhook] RAW PAYLOAD', { traceId, event });

  let reference: string | undefined;
  let verifiedAmountZAR: number | undefined;

  // ── Shape A: Checkout-API style ────────────────────────────────────
  if (event.type === 'payment.succeeded' && event.payload) {
    reference = event.payload.metadata?.reference;
    const checkoutId = event.payload.metadata?.checkoutId;

    if (!reference) {
      logger.warn('[yoco/webhook] Shape A payload missing metadata.reference', { traceId, checkoutId });
      return NextResponse.json({ ok: true });
    }

    // Independently re-fetch rather than trusting payload.amount alone —
    // same principle as Paystack's verifyTransaction().
    if (checkoutId) {
      try {
        const checkout = await fetchYocoCheckout(checkoutId);
        verifiedAmountZAR = checkout.amount / 100;
      } catch (err) {
        logger.error('[yoco/webhook] Shape A checkout re-fetch failed, falling back to payload amount', { traceId, checkoutId, error: String(err) });
        verifiedAmountZAR = event.payload.amount / 100;
      }
    } else {
      verifiedAmountZAR = event.payload.amount / 100;
    }

  // ── Shape B: v1 subscriptions style ─────────────────────────────────
  } else if (event.event_type === 'payment.created' && event.payment_id) {
    // No inline metadata — fetch the payment to find our reference and
    // the verified amount. Endpoint path is a best-effort guess (Yoco's
    // public docs don't confirm this specific GET path); if this 404s,
    // check logs for the raw payload above and the actual required path.
    try {
      const secretKey = process.env.YOCO_SECRET_KEY;
      const res = await fetch(`https://api.yoco.com/v1/payments/${event.payment_id}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!res.ok) {
        logger.error('[yoco/webhook] Shape B payment fetch failed', { traceId, paymentId: event.payment_id, status: res.status });
        return NextResponse.json({ ok: true });
      }
      const payment = await res.json();
      reference = payment.metadata?.reference;
      verifiedAmountZAR = (payment.amount ?? 0) / 100;
    } catch (err) {
      logger.error('[yoco/webhook] Shape B fetch error', { traceId, error: String(err) });
      return NextResponse.json({ ok: true });
    }

    if (!reference) {
      logger.warn('[yoco/webhook] Shape B payment missing metadata.reference', { traceId, paymentId: event.payment_id });
      return NextResponse.json({ ok: true });
    }

  } else {
    // Not a success event we care about (payment.failed / payment.refunded / unrecognized shape)
    return NextResponse.json({ ok: true });
  }

  if (!reference || verifiedAmountZAR === undefined) {
    return NextResponse.json({ ok: true });
  }

  const result = await confirmDirectPurchase({
    reference,
    verifiedAmountZAR,
    payoutMethod: 'yoco',
    traceId,
  });

  if (!result.ok && result.reason === 'amount_mismatch') {
    return new NextResponse('Amount mismatch', { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
