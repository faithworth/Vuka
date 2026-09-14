

/**
 * POST /api/checkout/paystack/webhook
 *
 * THE single Paystack webhook URL — register ONLY this URL in the Paystack
 * Dashboard (Settings → API Keys & Webhooks). Paystack supports exactly one
 * webhook URL per account, so this route dispatches by reference prefix:
 *
 *   VKB_  → beat/release/video/sample/merch purchase (handled below)
 *   PLAN_ → artist plan subscription   → handlePlanEvent
 *   MKT_  → marketplace service order  → handleMarketplaceEvent
 *   MEM_  → fan creator membership     → handleMembershipEvent
 *   ISO_  → industry service order     → handleIndustryOrderEvent
 *   SUP_  → fan support / tip          → handleSupportEvent
 *   TICKET_   → event ticket purchase  → handleTicketEvent
 *   campaign_ → campaign pledge        → handleCampaignEvent
 *
 * Replaces /api/checkout/payfast/notify.
 * Handles beat, release, video, sample, merch purchase confirmation.
 * Reference stored in purchase.paystackReference during initialize.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPaystackWebhook, verifyTransaction } from '@/lib/paystack';
import { logger } from '@/lib/logger';
import { handlePlanEvent, handleMarketplaceEvent, handleMembershipEvent, handleIndustryOrderEvent, handleSupportEvent, handleTicketEvent, handleCampaignEvent } from '@/lib/webhooks/paystack-handlers';
import { handlePaystackTransferWebhook } from '@/lib/earnings';
import { confirmDirectPurchase } from '@/lib/purchase-confirmation';

export async function POST(req: NextRequest) {
  const traceId   = req.headers.get('x-trace-id') ?? 'no-trace';
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const rawBody   = await req.text();

  if (!verifyPaystackWebhook(rawBody, signature)) {
    logger.warn('[paystack/webhook] Invalid signature', { traceId });
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new NextResponse('Bad JSON', { status: 400 }); }

  // ── Transfer events (outbound payouts) ──────────────────────────────
  if (event.event === 'transfer.success' || event.event === 'transfer.failed') {
    await handlePaystackTransferWebhook(event).catch(e =>
      logger.error('[paystack/webhook] transfer webhook handler failed', { traceId, error: String(e) })
    );
    return NextResponse.json({ ok: true });
  }

  if (event.event !== 'charge.success') return NextResponse.json({ ok: true });

  const reference = event.data?.reference ?? '';

  // ── Single-webhook dispatch ────────────────────────────────────────────
  // Paystack only supports ONE webhook URL per account. This route is that
  // URL — dispatch to the right handler based on the reference prefix set
  // by generateReference() in each checkout flow.
  if (reference.startsWith('PLAN_')) {
    await handlePlanEvent(event, traceId);
    return NextResponse.json({ ok: true });
  }
  if (reference.startsWith('MKT_')) {
    await handleMarketplaceEvent(event, traceId);
    return NextResponse.json({ ok: true });
  }
  if (reference.startsWith('MEM_')) {
    await handleMembershipEvent(event, traceId);
    return NextResponse.json({ ok: true });
  }
  if (reference.startsWith('ISO_')) {
    await handleIndustryOrderEvent(event, traceId);
    return NextResponse.json({ ok: true });
  }
  if (reference.startsWith('SUP_')) {
    await handleSupportEvent(event, traceId);
    return NextResponse.json({ ok: true });
  }
  // FIX: event tickets and campaign pledges were charged via Paystack but
  // never confirmed — their reference prefixes weren't dispatched anywhere,
  // so they fell through to the generic Purchase lookup below, found
  // nothing (they live in TicketPurchase/CampaignBacker, not Purchase),
  // and silently no-opped. Paid tickets stayed invalid forever and pledges
  // never counted toward the campaign.
  // BUG FIX: src/app/api/events/checkout/route.ts generates ticket
  // references via generateReference('TICKET') — i.e. "TICKET_XXXX_YYYYY"
  // (uppercase), matching every other prefix's convention (PLAN_, MKT_,
  // SUP_, etc). This check was comparing against lowercase 'ticket_', which
  // never matches, so every paid ticket fell through to the generic
  // Purchase lookup below, found nothing, and silently no-opped — the
  // charge succeeded on Paystack but the ticket stayed 'pending' forever
  // and no confirmation email was ever sent.
  if (reference.startsWith('TICKET_')) {
    await handleTicketEvent(event, traceId);
    return NextResponse.json({ ok: true });
  }
  if (reference.startsWith('campaign_')) {
    await handleCampaignEvent(event, traceId);
    return NextResponse.json({ ok: true });
  }

  // Find purchase by stored reference, verify with Paystack, and run the
  // shared confirmation core (licensing, splits, plaques, invoices, emails,
  // ArtistPayout ledger entry) — identical logic used by the Yoco webhook.
  let verification;
  try {
    verification = await verifyTransaction(reference);
  } catch (err) {
    logger.error('[paystack/webhook] Verification failed', { traceId, reference, error: String(err) });
    return NextResponse.json({ ok: true });
  }

  if (verification.status !== 'success') return NextResponse.json({ ok: true });

  const result = await confirmDirectPurchase({
    reference,
    verifiedAmountZAR: verification.amountZAR,
    payoutMethod: 'paystack',
    traceId,
  });

  if (!result.ok && result.reason === 'amount_mismatch') {
    return new NextResponse('Amount mismatch', { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
