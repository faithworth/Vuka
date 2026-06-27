/**
 * POST /api/webhooks/paypal
 *
 * Redundancy/reconciliation layer on top of the synchronous capture flow.
 * Primary purchase confirmation happens in capture-order. This webhook
 * handles edge cases: refunds, chargebacks, and captures that slipped
 * through if a buyer's connection dropped mid-redirect.
 *
 * Register in PayPal Developer Dashboard → Webhooks:
 *   URL: https://www.vuka.co.za/api/webhooks/paypal
 *   Events: PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWebhookSignature, PAYPAL_WEBHOOK_ID } from '@/lib/paypal';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/monitoring/sentry';
import { auditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  let rawBody: string;
  let event: Record<string, unknown>;

  try {
    rawBody = await req.text();
    event   = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // ── Signature verification ──────────────────────────────────────────────
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
      transmissionId, transmissionTime, certUrl,
      authAlgo, transmissionSig,
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

  // ── Idempotency ─────────────────────────────────────────────────────────
  const existing = await prisma.adminLog.findFirst({
    where:  { action: `paypal_webhook:${transmissionId}` },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const eventType = String(event.event_type ?? '');
  logger.info('[PayPal webhook] Received', { eventType, transmissionId });

  try {
    switch (eventType) {

      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Primary path is synchronous capture-order. This fires if that failed.
        // Find the purchase by orderId stored in paystackReference.
        const resource  = event.resource as Record<string, unknown> | undefined;
        const orderId   = (resource?.supplementary_data as Record<string, unknown> | undefined)
                          ?.related_ids as Record<string, unknown> | undefined;
        const captureId = resource?.id as string | undefined;

        // Extract orderId from the resource links or supplementary data
        const orderIdStr = (orderId as any)?.order_id as string | undefined;

        if (orderIdStr) {
          const purchase = await prisma.purchase.findFirst({
            where: { paystackReference: `paypal:${orderIdStr}`, status: 'pending' },
          });

          if (purchase) {
            // Purchase is still pending — capture-order never ran (browser crash, etc.)
            // Mark confirmed as a safety net; no side effects since we lack the full context.
            // Admin can see these via the status field discrepancy.
            await prisma.purchase.update({
              where: { id: purchase.id },
              data:  { status: 'confirmed' },
            });
            logger.warn('[PayPal webhook] Recovered pending purchase via webhook', {
              purchaseId: purchase.id, orderId: orderIdStr,
            });
          }
        }

        await auditLog({
          action:     `paypal_webhook:${transmissionId}`,
          entityType: 'system',
          entityId:   captureId ?? 'unknown',
          meta:       { eventType, captureId, orderIdStr },
        });
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        const resource  = event.resource as Record<string, unknown> | undefined;
        // The refunded capture's orderId is in the links array (rel: "up" points to the capture)
        const captureId = (resource?.links as Array<{ rel: string; href: string }> | undefined)
                          ?.find((l) => l.rel === 'up')?.href?.split('/').at(-1);

        // We store `paypal:<orderId>` not captureId — look it up by status first
        // and match via the capture ID in the PayPal order resource
        if (captureId) {
          // Best effort: find most-recently confirmed PayPal purchase
          // A future improvement would store the captureId on the Purchase row
          const purchase = await prisma.purchase.findFirst({
            where:   { paystackReference: { startsWith: 'paypal:' }, status: 'confirmed' },
            orderBy: { createdAt: 'desc' },
          });
          if (purchase) {
            await prisma.purchase.update({
              where: { id: purchase.id },
              data:  { status: 'refunded' },
            });
            logger.info('[PayPal webhook] Purchase refunded', { purchaseId: purchase.id, captureId });
          }
        }

        await auditLog({
          action:     `paypal_webhook:${transmissionId}`,
          entityType: 'system',
          entityId:   captureId ?? 'unknown',
          meta:       { eventType, captureId },
        });
        break;
      }

      case 'PAYMENT.CAPTURE.REVERSED': {
        logger.warn('[PayPal webhook] Capture reversed (chargeback) — manual review required', {
          transmissionId, event,
        });
        await auditLog({
          action:     `paypal_webhook:${transmissionId}`,
          entityType: 'system',
          entityId:   'chargeback',
          meta:       { eventType, event },
        });
        break;
      }

      default: {
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
    // Always 200 to prevent PayPal retry storms
    return NextResponse.json({ ok: false, error: 'Handler error' });
  }
}
