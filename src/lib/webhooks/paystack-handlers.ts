// src/lib/webhooks/paystack-handlers.ts
//
// Shared Paystack `charge.success` event handlers, extracted so they can be
// called either from their own dedicated routes (/api/plans/notify,
// /api/marketplace/checkout/notify, /api/creator/memberships/notify) OR from
// the single registered Paystack webhook (/api/checkout/paystack/webhook),
// which dispatches by reference prefix since Paystack only allows ONE
// webhook URL per account.
//
// Reference prefixes:
//   VKB_  → beat/release/video/sample/merch purchase  (handled inline in /api/checkout/paystack/webhook)
//   PLAN_ → artist plan subscription                   (handlePlanEvent)
//   MKT_  → marketplace service order                  (handleMarketplaceEvent)
//   MEM_  → fan creator membership                     (handleMembershipEvent)
//   ISO_  → industry service order                     (handleIndustryOrderEvent)
//   SUP_  → fan support / tip                           (handleSupportEvent)
//   TICKET_ → event ticket purchase                     (handleTicketEvent)

import prisma, { queryRaw, executeRaw } from '@/lib/prisma';
import { verifyTransaction } from '@/lib/paystack';
import { PLANS } from '@/lib/plans';
import { platformFee as calcFee, artistNet as calcNet } from '@/lib/plans';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { sendSupportFanConfirmation, sendSupportArtistNotification, sendTicketConfirmation, sendCampaignBackerConfirmation } from '@/lib/emails';

export type PaystackChargeEvent = {
  event: string;
  data: {
    reference: string;
    metadata?: Record<string, any>;
    customer?: { email?: string; first_name?: string };
  };
};

// ── PLAN_ — artist plan subscription ──────────────────────────────────────
export async function handlePlanEvent(event: PaystackChargeEvent, traceId = 'no-trace') {
  const reference = event.data?.reference ?? '';
  const metadata  = event.data?.metadata ?? {};
  const artistId  = metadata.artistId;
  const planSlug  = metadata.planSlug;

  if (!artistId || !planSlug) {
    logger.warn('[plans/notify] Missing metadata', { traceId, reference });
    return;
  }

  const plan = PLANS.find(p => p.slug === planSlug);
  if (!plan || plan.priceZAR === 0) {
    logger.warn('[plans/notify] Invalid plan', { traceId, planSlug });
    return;
  }

  try {
    const already = await prisma.artistPlanSubscription.findFirst({
      where: { paystackReference: reference },
    });
    if (already) {
      logger.info('[plans/notify] Duplicate — already processed', { traceId, reference });
      return;
    }

    const verification = await verifyTransaction(reference);
    if (verification.status !== 'success') return;

    const now       = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.artist.update({
      where: { id: artistId },
      data: { planSlug, planExpiresAt: periodEnd },
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

    await auditLog.adminAction('plan.activated', 'Artist', artistId, 'system', `Plan ${planSlug} activated via Paystack ${reference}`);
    logger.info('[plans/notify] Plan activated', { traceId, artistId, planSlug, reference });
  } catch (err) {
    logger.error('[plans/notify] Error activating plan', { traceId, artistId, planSlug, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── MKT_ — marketplace service order ──────────────────────────────────────
export async function handleMarketplaceEvent(event: PaystackChargeEvent, traceId = 'no-trace') {
  const reference  = event.data?.reference ?? '';
  const metadata   = event.data?.metadata ?? {};
  const orderId    = metadata.orderId;
  const artistId   = metadata.artistId;
  const buyerEmail = metadata.buyerEmail ?? '';

  if (!orderId) return;

  try {
    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) { logger.warn('[marketplace/notify] Order not found', { traceId, orderId }); return; }
    if (order.status !== 'pending') { logger.info('[marketplace/notify] Duplicate', { traceId, orderId }); return; }

    const verification = await verifyTransaction(reference);
    if (verification.status !== 'success') return;

    const amountGross = verification.amountZAR;

    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { planSlug: true, planExpiresAt: true, lifetimeGrossSales: true } });
    const fee = calcFee(amountGross, artist?.planSlug, artist?.planExpiresAt, artist?.lifetimeGrossSales ?? 0);
    const net = calcNet(amountGross, artist?.planSlug, artist?.planExpiresAt, artist?.lifetimeGrossSales ?? 0);

    await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { status: 'active' } });
    await prisma.marketplaceService.update({ where: { id: order.serviceId }, data: { totalOrders: { increment: 1 } } }).catch(() => {});

    await prisma.artistPayout.create({
      data: {
        artistId,
        amount:    net,
        method:    'paystack',
        currency:  'ZAR',
        status:    'pending',
        reference,
        notes:     `Marketplace order ${orderId} — held pending delivery (fee: R${fee.toFixed(2)} kept by Vuka)`,
      },
    });

    await prisma.purchase.create({
      data: {
        itemType:          'marketplace',
        artistId,
        buyerEmail,
        buyerName:         event.data?.customer?.first_name ?? 'Client',
        amount:            amountGross,
        currency:          'ZAR',
        platformFee:       fee,
        netAmount:         net,
        status:            'confirmed',
        paystackReference: reference,
        downloadToken:     `marketplace-${reference}`,
      },
    });

    logger.info('[marketplace/notify] Order activated', { traceId, orderId, reference });

    await prisma.artist.update({
      where: { id: artistId },
      data:  { lifetimeGrossSales: { increment: amountGross } },
    }).catch(e => logger.error('[marketplace/notify] lifetimeGrossSales increment failed', { error: String(e) }));
  } catch (err) {
    logger.error('[marketplace/notify] Error', { traceId, orderId, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── MEM_ — fan creator membership ─────────────────────────────────────────
export async function handleMembershipEvent(event: PaystackChargeEvent, traceId = 'no-trace') {
  const reference = event.data?.reference ?? '';

  const membership = await prisma.creatorMembership.findFirst({
    where: { paystackReference: reference },
  });

  if (!membership) {
    logger.warn('[memberships/notify] Membership not found for reference', { traceId, reference });
    return;
  }

  if (membership.status === 'active') {
    logger.info('[memberships/notify] Already active — duplicate webhook ignored', { traceId, membershipId: membership.id });
    return;
  }

  let verification;
  try {
    verification = await verifyTransaction(reference);
  } catch (err) {
    logger.error('[memberships/notify] Verification failed', { traceId, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  if (verification.status !== 'success') return;

  try {
    const amountGross = verification.amountZAR;
    const interval    = membership.billingInterval || 'monthly';

    const now = new Date();
    const expiresAt = new Date(now);
    if (interval === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    await prisma.creatorMembership.update({
      where: { id: membership.id },
      data:  { status: 'active', expiresAt },
    });

    const artist = await prisma.artist.findUnique({
      where: { id: membership.artistId },
      select: { planSlug: true, planExpiresAt: true, lifetimeGrossSales: true },
    });

    const fee = calcFee(amountGross, artist?.planSlug, artist?.planExpiresAt, artist?.lifetimeGrossSales ?? 0);
    const net = calcNet(amountGross, artist?.planSlug, artist?.planExpiresAt, artist?.lifetimeGrossSales ?? 0);

    await prisma.artistPayout.create({
      data: {
        artistId:  membership.artistId,
        amount:    net,
        method:    'paystack',
        currency:  'ZAR',
        status:    'pending',
        reference,
        notes:     `Fan membership payment (fee: R${fee.toFixed(2)} kept by Vuka)`,
      },
    });

    await prisma.purchase.create({
      data: {
        itemType:          'membership',
        artistId:          membership.artistId,
        buyerEmail:        verification.customerEmail || '',
        buyerName:         'Fan',
        amount:            amountGross,
        currency:          'ZAR',
        platformFee:       fee,
        netAmount:         net,
        status:            'confirmed',
        paystackReference: reference,
        downloadToken:     `membership-${reference}`,
      },
    });

    logger.info('[memberships/notify] Membership activated', { traceId, membershipId: membership.id });

    await prisma.artist.update({
      where: { id: membership.artistId },
      data:  { lifetimeGrossSales: { increment: amountGross } },
    }).catch(e => logger.error('[memberships/notify] lifetimeGrossSales increment failed', { error: String(e) }));
  } catch (err) {
    logger.error('[memberships/notify] Error', { traceId, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── SUP_ — fan support / tip ──────────────────────────────────────────────
export async function handleSupportEvent(event: PaystackChargeEvent, traceId = 'no-trace') {
  const reference = event.data?.reference ?? '';

  const txn = await prisma.supportTxn.findFirst({
    where: { paystackReference: reference },
    include: {
      artist: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!txn) {
    logger.warn('[support/notify] SupportTxn not found for reference', { traceId, reference });
    return;
  }

  if (txn.status !== 'pending') {
    logger.info('[support/notify] Already processed — duplicate webhook ignored', { traceId, reference });
    return;
  }

  let verification;
  try {
    verification = await verifyTransaction(reference);
  } catch (err) {
    logger.error('[support/notify] Verification failed', { traceId, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  if (verification.status !== 'success') return;

  try {
    await prisma.supportTxn.update({
      where: { id: txn.id },
      data:  { status: 'confirmed' },
    });

    const tipFee = calcFee(txn.amount, txn.artist.planSlug, txn.artist.planExpiresAt, txn.artist.lifetimeGrossSales ?? 0);
    const tipNet = calcNet(txn.amount, txn.artist.planSlug, txn.artist.planExpiresAt, txn.artist.lifetimeGrossSales ?? 0);

    await prisma.artistPayout.create({
      data: {
        artistId:  txn.artistId,
        amount:    tipNet,
        method:    'paystack',
        currency:  txn.currency,
        status:    'pending',
        reference,
        notes:     `Fan tip from ${txn.fanName} (fee: R${tipFee.toFixed(2)} kept by Vuka)`,
      },
    });

    await prisma.artist.update({
      where: { id: txn.artistId },
      data:  { lifetimeGrossSales: { increment: txn.amount } },
    }).catch(e => logger.error('[support/notify] lifetimeGrossSales increment failed', { error: String(e) }));

    await Promise.all([
      sendSupportFanConfirmation({ to: txn.fanEmail, fanName: txn.fanName, artistName: txn.artist.name, amount: txn.amount, currency: txn.currency, tier: txn.tier, message: txn.message || undefined }),
      sendSupportArtistNotification({ to: txn.artist.user.email, artistName: txn.artist.name, fanName: txn.fanName, amount: txn.amount, currency: txn.currency, tier: txn.tier, message: txn.message || undefined }),
    ]);

    logger.info('[support/notify] Tip confirmed', { traceId, txnId: txn.id });
  } catch (err) {
    logger.error('[support/notify] Processing error', { traceId, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── TICKET_ — event ticket purchase (one Paystack ref can cover several rows) ──
export async function handleTicketEvent(event: PaystackChargeEvent, traceId = 'no-trace') {
  const reference = event.data?.reference ?? '';

  const purchases = await prisma.ticketPurchase.findMany({
    where: { paystackReference: reference, status: 'pending' },
    include: { event: true, ticket: true },
  });

  if (!purchases.length) {
    logger.warn('[events/notify] No pending TicketPurchase rows for reference', { traceId, reference });
    return;
  }

  let verification;
  try {
    verification = await verifyTransaction(reference);
  } catch (err) {
    logger.error('[events/notify] Verification failed', { traceId, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  if (verification.status !== 'success') return;

  try {
    await prisma.ticketPurchase.updateMany({
      where: { id: { in: purchases.map(p => p.id) } },
      data:  { status: 'confirmed' },
    });

    await prisma.eventTicket.update({
      where: { id: purchases[0].ticketId },
      data:  { sold: { increment: purchases.length } },
    });

    const first = purchases[0];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
    const totalAmount = purchases.reduce((s, p) => s + p.totalAmount, 0);

    await sendTicketConfirmation({
      to: first.buyerEmail, buyerName: first.buyerName,
      eventTitle: first.event.title, eventVenue: first.event.venue, eventCity: first.event.city,
      eventStartDate: first.event.startDate, ticketName: first.ticket.name, quantity: purchases.length,
      amount: totalAmount, currency: first.currency,
      ticketUrls: purchases.map(p => `${appUrl}/tickets/${p.qrToken}`),
    });

    logger.info('[events/notify] Tickets confirmed', { traceId, count: purchases.length, reference });
  } catch (err) {
    logger.error('[events/notify] Processing error', { traceId, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── CAMP_ — campaign backing / pledge ──────────────────────────────────────
export async function handleCampaignEvent(event: PaystackChargeEvent, traceId = 'no-trace') {
  const reference = event.data?.reference ?? '';

  const backer = await prisma.campaignBacker.findFirst({
    where: { paystackReference: reference, status: 'pending' },
    include: { campaign: { include: { artist: true } }, tier: true },
  });

  if (!backer) {
    logger.warn('[campaign/notify] No pending CampaignBacker for reference', { traceId, reference });
    return;
  }

  let verification;
  try {
    verification = await verifyTransaction(reference);
  } catch (err) {
    logger.error('[campaign/notify] Verification failed', { traceId, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  if (verification.status !== 'success') return;

  try {
    await prisma.campaignBacker.update({
      where: { id: backer.id },
      data:  { status: 'confirmed' },
    });

    await prisma.campaign.update({
      where: { id: backer.campaignId },
      data:  { currentAmount: { increment: backer.amount }, backerCount: { increment: 1 } },
    });

    if (backer.tierId) {
      await prisma.campaignTier.update({
        where: { id: backer.tierId },
        data:  { backerCount: { increment: 1 } },
      }).catch(e => logger.error('[campaign/notify] tier backerCount increment failed', { error: String(e) }));
    }

    await sendCampaignBackerConfirmation({
      to: backer.backerEmail, backerName: backer.backerName,
      artistName: backer.campaign.artist.name, campaignTitle: backer.campaign.title,
      amount: backer.amount, currency: backer.currency,
      tierTitle: backer.tier?.title, message: backer.message || undefined,
    });

    logger.info('[campaign/notify] Backing confirmed', { traceId, backerId: backer.id, campaignId: backer.campaignId });
  } catch (err) {
    logger.error('[campaign/notify] Processing error', { traceId, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── ISO_ — industry service order (artist pays an industry professional) ──
// Platform takes a fixed 10% fee from this transaction type (not plan-based).
const INDUSTRY_PLATFORM_FEE_PCT = 0.10;

export async function handleIndustryOrderEvent(event: PaystackChargeEvent, traceId = 'no-trace') {
  const reference = event.data?.reference ?? '';
  const orderId   = reference.replace(/^ISO_/, '');

  try {
    const verification = await verifyTransaction(reference);
    if (verification.status !== 'success') {
      await executeRaw(
        `UPDATE "IndustryServiceOrder" SET status = 'failed', "updatedAt" = now() WHERE "payfastPaymentId" = $1 AND status = 'pending'`,
        reference,
      );
      return;
    }

    const amountGross = verification.amountZAR;

    const rows = await queryRaw(
      `SELECT iso.*, s.title AS "serviceTitle"
         FROM "IndustryServiceOrder" iso
         JOIN "IndustryService" s ON s.id = iso."serviceId"
        WHERE iso."payfastPaymentId" = $1 AND iso.status = 'pending'`,
      reference,
    );

    if (!rows.length) {
      logger.warn('[industry/notify] Order not found or already processed', { traceId, reference });
      return;
    }
    const o: any = rows[0];

    const platformFeeAmt = Math.round(amountGross * INDUSTRY_PLATFORM_FEE_PCT * 100) / 100;
    const netAmount      = Math.round((amountGross - platformFeeAmt) * 100) / 100;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "IndustryServiceOrder"
            SET status = 'paid', "platformFee" = $1, "netAmount" = $2, "updatedAt" = now()
          WHERE id = $3`,
        platformFeeAmt, netAmount, o.id,
      );

      await tx.artistPayout.create({
        data: {
          artistId: o.artistId,
          amount:   netAmount,
          method:   'paystack',
          currency: 'ZAR',
          status:   'pending',
          reference,
          notes:    `Industry service: ${o.serviceTitle} | industry_user:${o.industryUserId} | order:${o.id} (fee: R${platformFeeAmt.toFixed(2)} kept by Vuka)`,
        },
      });
    });

    logger.info('[industry/notify] Order paid', { traceId, orderId: o.id, gross: amountGross, fee: platformFeeAmt, net: netAmount });
  } catch (err) {
    logger.error('[industry/notify] Error', { traceId, orderId, error: err instanceof Error ? err.message : String(err) });
  }
}
