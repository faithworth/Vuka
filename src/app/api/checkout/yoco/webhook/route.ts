/**
 * POST /api/checkout/yoco/webhook
 *
 * Register this URL in the Yoco Business Portal → Developer settings →
 * Webhooks, subscribed to the `payment.succeeded` event (and optionally
 * `payment.failed` for logging). Yoco will issue a signing secret
 * (`whsec_...`) when you register it — set that as YOCO_WEBHOOK_SECRET.
 *
 * Covers the direct-purchase flow only (beats, releases, videos, samples,
 * merch) — same scope as /api/checkout/yoco/initialize. Plans, marketplace
 * orders, memberships, industry orders, tips, tickets, and campaign
 * pledges still run through the Paystack webhook.
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

  // Yoco's payload shape: { type: 'payment.succeeded' | 'payment.failed', payload: { id, metadata, amount, currency, status } }
  if (event.type !== 'payment.succeeded') {
    return NextResponse.json({ ok: true });
  }

  const checkoutId = event.payload?.metadata?.checkoutId || event.payload?.id;
  const reference   = event.payload?.metadata?.reference;

  if (!reference) {
    logger.warn('[yoco/webhook] No reference in payload metadata', { traceId, checkoutId });
    return NextResponse.json({ ok: true });
  }

  // Don't trust the webhook payload's amount/status alone — fetch the
  // checkout directly from Yoco, same principle as Paystack's
  // verifyTransaction().
  let checkoutStatus;
  try {
    checkoutStatus = await fetchYocoCheckout(checkoutId);
  } catch (err) {
    logger.error('[yoco/webhook] Checkout fetch failed', { traceId, checkoutId, error: String(err) });
    return NextResponse.json({ ok: true });
  }

  if (checkoutStatus.status !== 'completed' && checkoutStatus.status !== 'succeeded') {
    logger.info('[yoco/webhook] Checkout not in a completed state', { traceId, checkoutId, status: checkoutStatus.status });
    return NextResponse.json({ ok: true });
  }

  const verifiedAmountZAR = checkoutStatus.amount / 100; // Yoco reports cents

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
