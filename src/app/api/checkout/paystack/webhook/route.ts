

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
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';
import { sendPurchaseConfirmation, sendArtistSaleNotification } from '@/lib/emails';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { incrementDailyRollup } from '@/lib/social';
import { platformFee as calcPlatformFee } from '@/lib/plans';
import { checkAndAwardPlaques } from '@/lib/plaques';
import { disburseSplitSheet } from '@/lib/splits';
import { handlePlanEvent, handleMarketplaceEvent, handleMembershipEvent, handleIndustryOrderEvent, handleSupportEvent, handleTicketEvent, handleCampaignEvent } from '@/lib/webhooks/paystack-handlers';

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

  // Find purchase by stored reference
  const purchaseOrNull = await prisma.purchase.findFirst({
    where: { paystackReference: reference },
  });

  if (!purchaseOrNull) {
    logger.warn('[paystack/webhook] Purchase not found for reference', { traceId, reference });
    return NextResponse.json({ ok: true });
  }

  // Narrowed, non-null purchase reference. Using this (instead of the
  // original `purchaseOrNull`/`purchase` binding) everywhere below —
  // including inside the nested `issueLicensePdf` closure — because
  // TypeScript does not carry a null-check narrowing of an outer const
  // into a nested function body (TS18047), even though the value can't
  // actually change here.
  const purchase = purchaseOrNull;

  if (purchase.status !== 'pending') {
    logger.info('[paystack/webhook] Duplicate — already processed', { traceId, reference });
    return NextResponse.json({ ok: true });
  }

  // Verify via Paystack API (don't trust webhook payload amount alone)
  let verification;
  try {
    verification = await verifyTransaction(reference);
  } catch (err) {
    logger.error('[paystack/webhook] Verification failed', { traceId, reference, error: String(err) });
    return NextResponse.json({ ok: true });
  }

  if (verification.status !== 'success') return NextResponse.json({ ok: true });

  // Amount check
  if (Math.abs(verification.amountZAR - purchase.amount) > 0.01) {
    logger.error('[paystack/webhook] Amount mismatch', { traceId, paid: verification.amountZAR, expected: purchase.amount });
    await auditLog.securityEvent('security.invalid_download_attempt', `Amount mismatch purchaseId=${purchase.id}`, 'paystack');
    return new NextResponse('Amount mismatch', { status: 400 });
  }

  // Resolve plan for correct fee.
  // NOTE: previously only checked beatId/releaseId — video, sample, and
  // merch purchases fell through with artistPlanSlug staying null, which
  // silently forces the Free-tier rate (10%/9%/8.5%) even for Pro (8%) or
  // Label (5%) artists, quietly overcharging them on every such sale.
  let artistPlanSlug: string | null = null;
  let artistPlanExpiresAt: Date | null = null;
  if (purchase.beatId) {
    const beat = await prisma.beat.findUnique({ where: { id: purchase.beatId }, select: { artist: { select: { planSlug: true, planExpiresAt: true } } } });
    artistPlanSlug = beat?.artist?.planSlug ?? null;
    artistPlanExpiresAt = beat?.artist?.planExpiresAt ?? null;
  } else if ((purchase as any).releaseId) {
    const rel = await prisma.release.findUnique({ where: { id: (purchase as any).releaseId }, select: { artist: { select: { planSlug: true, planExpiresAt: true } } } });
    artistPlanSlug = rel?.artist?.planSlug ?? null;
    artistPlanExpiresAt = rel?.artist?.planExpiresAt ?? null;
  } else if (purchase.videoId) {
    const video = await prisma.video.findUnique({ where: { id: purchase.videoId }, select: { artist: { select: { planSlug: true, planExpiresAt: true } } } });
    artistPlanSlug = video?.artist?.planSlug ?? null;
    artistPlanExpiresAt = video?.artist?.planExpiresAt ?? null;
  } else if (purchase.sampleId) {
    const sample = await prisma.sample.findUnique({ where: { id: purchase.sampleId }, select: { artist: { select: { planSlug: true, planExpiresAt: true } } } });
    artistPlanSlug = sample?.artist?.planSlug ?? null;
    artistPlanExpiresAt = sample?.artist?.planExpiresAt ?? null;
  } else if ((purchase as any).merchId) {
    const merchItem = await prisma.merch.findUnique({ where: { id: (purchase as any).merchId }, select: { artist: { select: { planSlug: true, planExpiresAt: true } } } });
    artistPlanSlug = merchItem?.artist?.planSlug ?? null;
    artistPlanExpiresAt = merchItem?.artist?.planExpiresAt ?? null;
  }

  const platformFeeAmt = calcPlatformFee(purchase.amount, artistPlanSlug, artistPlanExpiresAt);
  const netAmount      = Math.round((purchase.amount - platformFeeAmt) * 100) / 100;

  // Link userId if not set
  let resolvedUserId = purchase.userId;
  if (!resolvedUserId && purchase.buyerEmail) {
    const buyer = await prisma.user.findUnique({ where: { email: purchase.buyerEmail }, select: { id: true } }).catch(() => null);
    resolvedUserId = buyer?.id ?? null;
  }

  // ── Atomic claim ──────────────────────────────────────────────────────
  // FIX: two concurrent webhook deliveries for the same reference (Paystack
  // retries on any non-2xx, or genuinely duplicate deliveries) could both
  // pass the `purchase.status !== 'pending'` check above before either had
  // written 'confirmed' back — a classic check-then-act race that could
  // double-run every side effect below (double payout, double plaque
  // check, double split disbursement). The update is now conditioned on
  // status still being 'pending' at write time; only the delivery that
  // wins the race gets claim.count === 1 and proceeds past this point.
  const claim = await prisma.purchase.updateMany({
    where: { id: purchase.id, status: 'pending' },
    data: {
      status: 'confirmed',
      platformFee: platformFeeAmt,
      netAmount,
      ...(resolvedUserId && !purchase.userId ? { userId: resolvedUserId } : {}),
    },
  });

  if (claim.count === 0) {
    logger.info('[paystack/webhook] Lost claim race — already confirmed by a concurrent delivery', { traceId, reference });
    return NextResponse.json({ ok: true });
  }

  // ── Auto-stepping fee: increment Artist.lifetimeGrossSales ──
  // Resolved lazily below once we know the artistId. Moved to after artist resolution.
  // Flag to trigger increment after artistId is known.
  let pendingLifetimeSalesIncrement = purchase.amount;

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
  const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;

  let itemName    = 'your purchase';
  let artistEmail = '';
  let artistName  = '';
  let artworkUrl  = '';
  let artistId    = '';
  let licenseUrl  = '';

  // Generates + uploads a license PDF for any item type (previously
  // beat-only). Sales/purchase pages let buyers pick a licenseType for
  // release/video/sample purchases too (schemas.checkout.paystackInitialize
  // applies licenseType to every itemType), so those buyers were charged
  // for a license but never received the document.
  async function issueLicensePdf(itemTitle: string, itemArtistName: string, itemKind: 'beat' | 'release' | 'video' | 'sample') {
    try {
      const pdfBuffer = await generateLicensePDF({
        licenseId:   purchase.licenseId,
        licenseType: purchase.licenseType || 'standard',
        beatTitle:   itemTitle,
        artistName:  itemArtistName,
        buyerName:   purchase.buyerName,
        buyerEmail:  purchase.buyerEmail,
        amount:      purchase.amount,
        currency:    purchase.currency,
        date:        new Date(),
        itemKind,
      });
      const pdfKey = r2Keys.license(purchase.licenseId);
      await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
      const url = getPublicUrl(pdfKey);
      await prisma.purchase.update({ where: { id: purchase.id }, data: { licenseUrl: url } });
      return url;
    } catch (e) {
      logger.error('[paystack/webhook] PDF failed', { traceId, error: String(e) });
      return '';
    }
  }

  // FIX: the item-sales counter, the payout record, and the lifetime
  // gross-sales counter used to be written as five+ independent,
  // sequential prisma calls. A crash or timeout between any two of them
  // left the ledger inconsistent — e.g. a purchase marked 'confirmed'
  // with an incremented sales counter but no ArtistPayout row, so the
  // artist was never paid for a sale the buyer was charged for. These are
  // collected into txOps and committed together in one prisma.$transaction
  // below, so they either all land or none do.
  const txOps: any[] = [];

  if (purchase.itemType === 'beat' && purchase.beatId) {
    const beat = await prisma.beat.findUnique({ where: { id: purchase.beatId }, include: { artist: { include: { user: true } } } });
    if (beat) {
      itemName = beat.title; artistEmail = beat.artist.user.email;
      artistName = beat.artist.name; artworkUrl = beat.artworkUrl || ''; artistId = beat.artist.id;
      licenseUrl = await issueLicensePdf(beat.title, beat.artist.name, 'beat');
      if (purchase.licenseType === 'exclusive') {
        await prisma.beat.update({ where: { id: beat.id }, data: { isExclusive: true, isActive: false } });
        await auditLog.exclusiveLocked(beat.id, beat.title, purchase.id);
      }
      txOps.push(prisma.beat.update({ where: { id: beat.id }, data: { sales: { increment: 1 } } }));
      await incrementDailyRollup(artistId, 'beatSales').catch(() => {});
      await incrementDailyRollup(artistId, 'revenue').catch(() => {});
    }
  } else if (purchase.itemType === 'release' && (purchase as any).releaseId) {
    const release = await prisma.release.findUnique({ where: { id: (purchase as any).releaseId }, include: { artist: { include: { user: true } } } });
    if (release) {
      itemName = release.title; artistEmail = release.artist.user.email;
      artistName = release.artist.name; artworkUrl = release.artworkUrl || ''; artistId = release.artist.id;
      licenseUrl = await issueLicensePdf(release.title, release.artist.name, 'release');
      txOps.push(prisma.release.update({ where: { id: release.id }, data: { sales: { increment: 1 } } }));
      await incrementDailyRollup(artistId, 'releaseSales').catch(() => {});
      await incrementDailyRollup(artistId, 'revenue').catch(() => {});
    }
  } else if (purchase.itemType === 'video' && purchase.videoId) {
    const video = await prisma.video.findUnique({ where: { id: purchase.videoId }, include: { artist: { include: { user: true } } } });
    if (video) {
      itemName = video.title; artistEmail = video.artist.user.email;
      artistName = video.artist.name; artworkUrl = video.thumbnailUrl || ''; artistId = video.artist.id;
      licenseUrl = await issueLicensePdf(video.title, video.artist.name, 'video');
      txOps.push(prisma.video.update({ where: { id: video.id }, data: { sales: { increment: 1 } } }));
      await incrementDailyRollup(artistId, 'revenue').catch(() => {});
    }
  } else if (purchase.itemType === 'sample' && purchase.sampleId) {
    const sample = await prisma.sample.findUnique({ where: { id: purchase.sampleId }, include: { artist: { include: { user: true } } } });
    if (sample) {
      itemName = sample.title; artistEmail = sample.artist.user.email;
      artistName = sample.artist.name; artworkUrl = sample.artworkUrl || ''; artistId = sample.artist.id;
      licenseUrl = await issueLicensePdf(sample.title, sample.artist.name, 'sample');
      txOps.push(prisma.sample.update({ where: { id: sample.id }, data: { sales: { increment: 1 } } }));
      await incrementDailyRollup(artistId, 'revenue').catch(() => {});
    }
  } else if (purchase.itemType === 'merch' && (purchase as any).merchId) {
    const merch = await prisma.merch.findUnique({ where: { id: (purchase as any).merchId }, include: { artist: { include: { user: true } } } });
    if (merch) {
      itemName = merch.title; artistEmail = merch.artist.user.email;
      artistName = merch.artist.name; artworkUrl = merch.imageUrl || ''; artistId = merch.artist.id;
      txOps.push(prisma.merch.update({ where: { id: merch.id }, data: { stock: { decrement: 1 } } }));
      await incrementDailyRollup(artistId, 'revenue').catch(() => {});
    }
  }

  if (artistId) {
    txOps.push(prisma.artistPayout.create({
      data: { artistId, purchaseId: purchase.id, amount: netAmount, method: 'paystack', currency: purchase.currency, status: 'pending', reference, notes: `${purchase.itemType} sale via Paystack — ${itemName}` },
    }));

    // ── Auto-stepping fee: update lifetime gross sales counter ──
    // This drives the Free-tier rate reduction in platformFeeRate().
    if (pendingLifetimeSalesIncrement > 0) {
      txOps.push(prisma.artist.update({
        where: { id: artistId },
        data:  { lifetimeGrossSales: { increment: pendingLifetimeSalesIncrement } },
      }));
    }
  }

  // ── Commit the ledger atomically ────────────────────────────────────
  // Everything financially load-bearing (item sales/stock counter, payout
  // record, lifetime gross-sales counter) lands together or not at all.
  // If this throws, the purchase itself is already durably 'confirmed'
  // (claimed above) — we log loudly and alert so ops can reconcile the
  // payout manually, but we do NOT fail the webhook response, since a
  // 5xx here would make Paystack retry the whole webhook (including the
  // amount-verification API call) for a purchase that is, from the
  // buyer's perspective, already correctly charged and confirmed.
  if (txOps.length > 0) {
    try {
      await prisma.$transaction(txOps);
    } catch (e) {
      logger.error('[paystack/webhook] Ledger transaction failed — purchase confirmed but payout/counters may be incomplete', { traceId, purchaseId: purchase.id, artistId, error: String(e) });
      await auditLog.securityEvent('security.invalid_download_attempt', `Ledger transaction failed for purchaseId=${purchase.id}, artistId=${artistId}: ${String(e)}`, 'paystack').catch(() => {});
    }
  }

  if (artistId && pendingLifetimeSalesIncrement > 0) {
      // ── Check for new plaques earned ──
      checkAndAwardPlaques(artistId).catch(e =>
        logger.error('[paystack/webhook] plaque check failed', { error: String(e) })
      );

      // ── Auto-disburse split sheet if one exists for this item ──
      // Every directly-purchasable item type can carry a split sheet — Purchase
      // stores the item reference in a type-specific column rather than a
      // generic itemId, so resolve it per type.
      const splitItemId =
        purchase.itemType === 'beat'    ? purchase.beatId :
        purchase.itemType === 'release' ? purchase.releaseId :
        purchase.itemType === 'video'   ? purchase.videoId :
        purchase.itemType === 'sample'  ? purchase.sampleId :
        purchase.itemType === 'merch'   ? purchase.merchId :
        null;

      if (splitItemId) {
        disburseSplitSheet({
          itemType:   purchase.itemType,
          itemId:     splitItemId,
          purchaseId: purchase.id,
          grossAmount: purchase.amount,
          artistPlanSlug: undefined,
          artistPlanExpiry: undefined,
          lifetimeGrossSales: pendingLifetimeSalesIncrement,
        }).catch(e =>
          logger.error('[paystack/webhook] split disburse failed', { error: String(e) })
        );
      }
  }

  await auditLog.purchaseConfirmed(purchase.id, itemName, purchase.amount, purchase.currency, purchase.buyerEmail);

  const freshPurchase = await prisma.purchase.findUnique({ where: { id: purchase.id }, select: { receiptUrl: true } });
  if (freshPurchase?.receiptUrl !== 'email:sent') {
    try {
      await sendPurchaseConfirmation({ to: purchase.buyerEmail, buyerName: purchase.buyerName, itemName, itemType: purchase.itemType, licenseType: purchase.licenseType || undefined, downloadUrl, amount: purchase.amount, currency: purchase.currency, licenseId: purchase.licenseId, artworkUrl: artworkUrl || undefined, licenseUrl: licenseUrl || undefined });
      await prisma.purchase.update({ where: { id: purchase.id }, data: { receiptUrl: 'email:sent' } });
    } catch (e) { logger.error('[paystack/webhook] Buyer email failed', { traceId, error: String(e) }); }
  }

  if (artistEmail) {
    try {
      await sendArtistSaleNotification({ to: artistEmail, artistName, buyerName: purchase.buyerName, itemName, licenseType: purchase.licenseType || undefined, amount: purchase.amount, currency: purchase.currency, dashboardUrl: `${appUrl}/dashboard` });
    } catch (e) { logger.error('[paystack/webhook] Artist email failed', { traceId, error: String(e) }); }
  }

  logger.info('[paystack/webhook] Purchase confirmed', { traceId, purchaseId: purchase.id });
  return NextResponse.json({ ok: true });
}
