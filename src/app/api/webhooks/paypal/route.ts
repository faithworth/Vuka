--- src/app/api/webhooks/paypal/route.ts (sha: 952e6c026f1dbfbadf0f792a803e296909db9166) ---

/**
 * POST /api/webhooks/paypal
 *
 * Redundancy/reconciliation layer on top of the synchronous capture flow.
 * Primary purchase confirmation happens in capture-order. This webhook
 * handles edge cases: refunds, chargebacks, and captures that slipped
 * through if a buyer's connection dropped mid-redirect.
 *
 * Register in PayPal Developer Dashboard → Webhooks:
 *   URL: https://www.vukamusic.com/api/webhooks/paypal
 *   Events: PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWebhookSignature, PAYPAL_WEBHOOK_ID } from '@/lib/paypal';
import { logger } from '@/lib/logger';
import { markPayoutPaid, rejectPayoutRequest } from '@/lib/payouts';
import { sendInternalBusinessUpdate } from '@/lib/emails';
import { captureException } from '@/lib/monitoring/sentry';


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
              data:  { status: 'confirmed', paypalCaptureId: captureId ?? null },
            });
            logger.warn('[PayPal webhook] Recovered pending purchase via webhook', {
              purchaseId: purchase.id, orderId: orderIdStr,
            });
          }
        }

        await prisma.adminLog.create({ data: {
          action:     `paypal_webhook:${transmissionId}`,
          targetType: 'system',
          targetId:   captureId ?? 'unknown',
          notes:      JSON.stringify({ eventType, captureId, orderIdStr }),
        } }).catch(() => {});
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        const resource = event.resource as Record<string, unknown> | undefined;
        const captureId = resource?.id as string | undefined;

        if (captureId) {
          const purchase = await prisma.purchase.findFirst({
            where: { paypalCaptureId: captureId },
            select: { id: true, amount: true, currency: true, status: true },
          });
          if (purchase) {
            await prisma.purchase.update({
              where: { id: purchase.id },
              data: { status: 'refunded' },
            });
            logger.info('[PayPal webhook] Purchase refunded', { purchaseId: purchase.id, captureId });
            sendInternalBusinessUpdate({
              subject: 'PayPal purchase refunded',
              title: 'PayPal purchase refunded',
              summary: 'PayPal reported a completed purchase as refunded.',
              details: [
                { label: 'Purchase', value: purchase.id },
                { label: 'Amount', value: String(purchase.amount) + ' ' + purchase.currency },
                { label: 'Capture', value: captureId },
              ],
              url: (process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com') + '/admin/finance',
              buttonLabel: 'Open Finance →',
            }).catch(console.error);
          }
        }

        await prisma.adminLog.create({ data: {
          action:     `paypal_webhook:${transmissionId}`,
          targetType: 'system',
          targetId:   captureId ?? 'unknown',
          notes:      JSON.stringify({ eventType, captureId }),
        } }).catch(() => {});
        break;
      }

      case 'PAYMENT.PAYOUTSBATCH.SUCCESS':
      case 'PAYMENT.PAYOUTSBATCH.DENIED':
      case 'PAYMENT.PAYOUTSBATCH.PROCESSING':
      case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED':
      case 'PAYMENT.PAYOUTS-ITEM.FAILED':
      case 'PAYMENT.PAYOUTS-ITEM.BLOCKED':
      case 'PAYMENT.PAYOUTS-ITEM.CANCELED':
      case 'PAYMENT.PAYOUTS-ITEM.HELD':
      case 'PAYMENT.PAYOUTS-ITEM.RETURNED':
      case 'PAYMENT.PAYOUTS-ITEM.REFUNDED':
      case 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED': {
        const resource = event.resource as Record<string, unknown> | undefined;
        const item = (resource?.payout_item as Record<string, unknown> | undefined) ?? resource;
        const senderItemId = String(item?.sender_item_id ?? '');
        const batchId = String(resource?.payout_batch_id ?? resource?.batch_header?.payout_batch_id ?? '');
        const payoutRequest = senderItemId
          ? await prisma.payoutRequest.findUnique({ where: { id: senderItemId } })
          : batchId
            ? await prisma.payoutRequest.findFirst({ where: { paystackReference: `paypal_batch:${batchId}` } })
            : null;

        if (payoutRequest) {
          if (eventType === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED' || eventType === 'PAYMENT.PAYOUTSBATCH.SUCCESS') {
            if (payoutRequest.status !== 'paid') {
              await markPayoutPaid(
                payoutRequest.id,
                String(item?.transaction_id ?? batchId ?? payoutRequest.id),
              );
            }
          } else if (
            ['PAYMENT.PAYOUTS-ITEM.FAILED','PAYMENT.PAYOUTS-ITEM.BLOCKED','PAYMENT.PAYOUTS-ITEM.CANCELED','PAYMENT.PAYOUTSBATCH.DENIED'].includes(eventType)
            && payoutRequest.status !== 'paid'
          ) {
            await rejectPayoutRequest(payoutRequest.id, 'PayPal payout failed: ' + eventType);
          } else if (
            ['PAYMENT.PAYOUTS-ITEM.RETURNED','PAYMENT.PAYOUTS-ITEM.REFUNDED'].includes(eventType)
            && payoutRequest.status === 'paid'
          ) {
            await prisma.$transaction(async (tx) => {
              await tx.payoutRequest.update({
                where: { id: payoutRequest.id },
                data: { status: 'rejected', processedAt: null, adminNotes: 'PayPal payout returned/refunded; artist balance reopened.' },
              });
              await tx.artistPayout.updateMany({
                where: { claimedByPayoutRequestId: payoutRequest.id },
                data: { status: 'pending', claimedByPayoutRequestId: null, processedAt: null },
              });
            });
          }

          sendInternalBusinessUpdate({
            subject: 'PayPal payout update — ' + eventType,
            title: 'PayPal payout status update',
            summary: 'PayPal sent a payout status webhook to Vuka.',
            details: [
              { label: 'Event', value: eventType },
              { label: 'Request', value: payoutRequest.id },
              { label: 'Amount', value: String(payoutRequest.amount) + ' ' + payoutRequest.currency },
              { label: 'Batch', value: batchId || 'n/a' },
            ],
            url: (process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com') + '/admin/finance',
            buttonLabel: 'Open Finance →',
          }).catch(console.error);
        }
        break;
      }

      case 'PAYMENT.CAPTURE.REVERSED': {
        logger.warn('[PayPal webhook] Capture reversed (chargeback) — manual review required', {
          transmissionId, event,
        });
        await prisma.adminLog.create({ data: {
          action:     `paypal_webhook:${transmissionId}`,
          targetType: 'system',
          targetId:   'chargeback',
          notes:      JSON.stringify({ eventType }),
        } }).catch(() => {});
        break;
      }

      default: {
        await prisma.adminLog.create({ data: {
          action:     `paypal_webhook:${transmissionId}`,
          targetType: 'system',
          targetId:   eventType,
          notes:      JSON.stringify({ eventType }),
        } }).catch(() => {});
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