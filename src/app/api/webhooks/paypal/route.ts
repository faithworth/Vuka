/**
 * POST /api/webhooks/paypal
 *
 * Receives PayPal webhook events and processes them.
 * PayPal uses webhook-ID-based signature verification — not HMAC.
 *
 * Events handled:
 *   PAYMENT.CAPTURE.COMPLETED   — payment captured (redundancy check)
 *   PAYMENT.CAPTURE.REFUNDED    — refund issued
 *   PAYMENT.CAPTURE.REVERSED    — chargeback / reversal
 *   CHECKOUT.ORDER.APPROVED     — buyer approved (info only, we capture explicitly)
 *
 * Register this URL in your PayPal developer dashboard:
 *   https://developer.paypal.com/dashboard/applications → Webhooks
 *   URL: https://www.vuka.co.za/api/webhooks/paypal
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWebhookSignature, PAYPAL_WEBHOOK_ID } from '@/lib/paypal';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/monitoring/sentry';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // ── Read raw body for verification ────────────────────────────────────
  let rawBody: string;
  let event: Record<string, unknown>;

  try {
    rawBody = await req.text();
    event   = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // ── Signature verification ─────────────────────────────────────────────
  const transmissionId   = req.headers.get('paypal-transmission-id')   ?? '';
  const transmissionTime = req.headers.get('paypal-transmission-time') ?? '';
  const certUrl          = req.headers.get('paypal-cert-url')          ?? '';
  const authAlgo         = req.headers.get('paypal-auth-algo')         ?? '';
  const transmissionSig  = req.headers.get('paypal-transmission-sig')  ?? '';

  if (!transmissionId || !transmissionSig) {
    logger.warn('[PayPal webhook] Missing signature headers');
    return NextResponse.json({ error: 'Missing PayPal headers' }, { status: 401 });
  }

  if (PAYPAL_WEBHOOK_ID) {
    const valid = await verifyWebhookSignature({
      transmissionId,
      transmissionTime,
      certUrl,
      authAlgo,
      transmissionSig,
      webhookId:    PAYPAL_WEBHOOK_ID,
      webhookEvent: event,
    });

    if (!valid) {
      logger.warn('[PayPal webhook] Signature verification failed', { transmissionId });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else {
    logger.warn('[PayPal webhook] PAYPAL_WEBHOOK_ID not set — skipping verification (unsafe in production)');
  }

  // ── Idempotency via transmissionId ─────────────────────────────────────
  const existing = await prisma.adminLog.findFirst({
    where: { action: `paypal_webhook:${transmissionId}` },
    select: { id: true },
  });
  if (existing) {
    logger.info('[PayPal webhook] Duplicate event ignored', { transmissionId });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const eventType = String(event.event_type ?? '');
  logger.info('[PayPal webhook] Received', { eventType, transmissionId });

  try {
    switch (eventType) {

      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Buyer payment successfully captured — redundancy check.
        // Primary capture happens in /api/checkout/paypal/capture-order.
        const resource   = event.resource as Record<string, unknown> | undefined;
        const orderId    = (resource?.supplementary_data as Record<string, unknown> | undefined)
                            ?.related_ids as Record<string, unknown> | undefined;
        const captureId  = resource?.id as string | undefined;

        if (captureId) {
          // Attempt to confirm any pending purchase with this PayPal reference
          await prisma.purchase.updateMany({
            where: {
              paystackReference: { startsWith: 'paypal:' },
              status: 'pending',
            },
            data: { status: 'confirmed' },
          });
        }

        await auditLog({
          action:     `paypal_webhook:${transmissionId}`,
          entityType: 'system',
          entityId:   captureId ?? 'unknown',
          meta:       { eventType, captureId },
        });
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        const resource  = event.resource as Record<string, unknown> | undefined;
        const captureId = (resource?.links as Array<{ rel: string; href: string }> | undefined)
                          ?.find((l) => l.rel === 'up')?.href?.split('/').at(-1);

        if (captureId) {
          // Find the purchase by PayPal capture and mark refunded
          const purchase = await prisma.purchase.findFirst({
            where: { paystackReference: { startsWith: 'paypal:' } },
            select: { id: true },
          });
          if (purchase) {
            await prisma.purchase.update({
              where: { id: purchase.id },
              data:  { status: 'refunded' },
            });
          }
        }

        await auditLog({
          action:     `paypal_webhook:${transmissionId}`,
          entityType: 'system',
          entityId:   captureId ?? 'unknown',
          meta:       { eventType },
        });
        break;
      }

      case 'PAYMENT.CAPTURE.REVERSED': {
        // Chargeback — flag for manual review
        logger.warn('[PayPal webhook] Capture reversed (chargeback)', { transmissionId, event });

        await auditLog({
          action:     `paypal_webhook:${transmissionId}`,
          entityType: 'system',
          entityId:   'chargeback',
          meta:       { eventType, event },
        });
        break;
      }

      default: {
        // Acknowledge all other events — don't error on unknown types
        await auditLog({
          action:     `paypal_webhook:${transmissionId}`,
          entityType: 'system',
          entityId:   eventType,
          meta:       { eventType },
        });
        break;
      }
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    captureException(err, { action: 'paypal-webhook', eventType, transmissionId });
    logger.error('[PayPal webhook] Handler error', { err, eventType, transmissionId });
    // Return 200 to prevent PayPal from retrying indefinitely on our bugs
    return NextResponse.json({ ok: false, error: 'Handler error' });
  }
}
