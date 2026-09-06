// ============================================================
// src/lib/purchase-confirmation.ts
//
// Shared "confirm a paid Purchase" core — extracted from the Paystack
// webhook (src/app/api/checkout/paystack/webhook/route.ts) so a second
// payment processor (Yoco) can trigger the exact same downstream behavior
// — licensing, split-sheet disbursement, plaques, invoices, emails,
// ArtistPayout ledger entry — without duplicating ~300 lines of business
// logic per processor.
//
// This is a pure extraction: the logic here is unchanged from what used
// to run inline in the Paystack webhook after signature/amount
// verification. The caller is responsible for verifying the payment with
// its own processor BEFORE calling this — this function trusts the
// `verifiedAmountZAR` it's given.
// ============================================================

import prisma from './prisma';
import { generateLicensePDF } from './pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from './r2';
import { sendPurchaseConfirmation, sendArtistSaleNotification } from './emails';
import { auditLog } from './audit';
import { logger } from './logger';
import { incrementDailyRollup } from './social';
import { platformFee as calcPlatformFee } from './plans';
import { checkAndAwardPlaques } from './plaques';
import { disburseSplitSheet } from './splits';
import { issueBeatLicense } from './licensing';
import { createInvoiceFromPurchase } from './invoices';

export type PayoutMethod = 'paystack' | 'yoco';

export async function confirmDirectPurchase(params: {
  reference: string;
  verifiedAmountZAR: number;
  payoutMethod: PayoutMethod;
  traceId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { reference, verifiedAmountZAR, payoutMethod, traceId } = params;

  const purchaseOrNull = await prisma.purchase.findFirst({
    where: { paystackReference: reference }, // column reused as a generic gateway-reference lookup across processors
  });

  if (!purchaseOrNull) {
    logger.warn('[purchase-confirmation] Purchase not found for reference', { traceId, reference, payoutMethod });
    return { ok: true }; // not our reference — let caller's dispatcher move on
  }

  const purchase = purchaseOrNull;

  if (purchase.status !== 'pending') {
    logger.info('[purchase-confirmation] Duplicate — already processed', { traceId, reference, payoutMethod });
    return { ok: true };
  }

  if (Math.abs(verifiedAmountZAR - purchase.amount) > 0.01) {
    logger.error('[purchase-confirmation] Amount mismatch', { traceId, paid: verifiedAmountZAR, expected: purchase.amount, payoutMethod });
    await auditLog.securityEvent('security.invalid_download_attempt', `Amount mismatch purchaseId=${purchase.id}`, payoutMethod);
    return { ok: false, reason: 'amount_mismatch' };
  }

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

  const shippingFeeAmt = (purchase as any).shippingFee || 0;
  const commissionBase = purchase.amount - shippingFeeAmt;
  const platformFeeAmt = calcPlatformFee(commissionBase, artistPlanSlug, artistPlanExpiresAt);
  const netAmount = Math.round((commissionBase - platformFeeAmt + shippingFeeAmt) * 100) / 100;

  let resolvedUserId = purchase.userId;
  if (!resolvedUserId && purchase.buyerEmail) {
    const buyer = await prisma.user.findUnique({ where: { email: purchase.buyerEmail }, select: { id: true } }).catch(() => null);
    resolvedUserId = buyer?.id ?? null;
  }

  const claim = await prisma.purchase.updateMany({
    where: { id: purchase.id, status: 'pending' },
    data: {
      status: 'confirmed',
      platformFee: platformFeeAmt,
      netAmount,
      ...(resolvedUserId && !purchase.userId ? { userId: resolvedUserId } : {}),
      ...(purchase.itemType === 'merch' ? { fulfillmentStatus: 'awaiting_shipment' } : {}),
    },
  });

  if (claim.count === 0) {
    logger.info('[purchase-confirmation] Lost claim race — already confirmed by a concurrent delivery', { traceId, reference, payoutMethod });
    return { ok: true };
  }

  let pendingLifetimeSalesIncrement = purchase.amount;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
  const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;

  let itemName = 'your purchase';
  let artistEmail = '';
  let artistName = '';
  let artworkUrl = '';
  let artistId = '';
  let licenseUrl = '';

  async function issueLicensePdf(itemTitle: string, itemArtistName: string, itemKind: 'beat' | 'release' | 'video' | 'sample') {
    try {
      const pdfBuffer = await generateLicensePDF({
        licenseId: purchase.licenseId,
        licenseType: purchase.licenseType || 'standard',
        beatTitle: itemTitle,
        artistName: itemArtistName,
        buyerName: purchase.buyerName,
        buyerEmail: purchase.buyerEmail,
        amount: purchase.amount,
        currency: purchase.currency,
        date: new Date(),
        itemKind,
      });
      const pdfKey = r2Keys.license(purchase.licenseId);
      await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
      const url = getPublicUrl(pdfKey);
      await prisma.purchase.update({ where: { id: purchase.id }, data: { licenseUrl: url } });
      return url;
    } catch (e) {
      logger.error('[purchase-confirmation] PDF failed', { traceId, error: String(e) });
      return '';
    }
  }

  const txOps: any[] = [];

  if (purchase.itemType === 'beat' && purchase.beatId) {
    const beat = await prisma.beat.findUnique({ where: { id: purchase.beatId }, include: { artist: { include: { user: true } } } });
    if (beat) {
      itemName = beat.title; artistEmail = beat.artist.user.email;
      artistName = beat.artist.name; artworkUrl = beat.artworkUrl || ''; artistId = beat.artist.id;
      licenseUrl = await issueLicensePdf(beat.title, beat.artist.name, 'beat');
      issueBeatLicense({
        purchaseId: purchase.id,
        buyerName: purchase.buyerName,
        buyerEmail: purchase.buyerEmail,
        artistName: beat.artist.name,
        songTitle: beat.title,
      }).catch(e => logger.error('[purchase-confirmation] beat license key issuance failed', { traceId, error: String(e) }));
      if (purchase.licenseType === 'exclusive') {
        await prisma.beat.update({ where: { id: beat.id }, data: { isExclusive: true, isActive: false } });
        await auditLog.exclusiveLocked(beat.id, beat.title, purchase.id);
      }
      txOps.push(prisma.beat.update({ where: { id: beat.id }, data: { sales: { increment: 1 } } }));
      txOps.push(prisma.revenueRecord.create({
        data: { artistId, type: 'beat_sale', amount: purchase.amount, platformFee: platformFeeAmt, netAmount, currency: purchase.currency, period: new Date().toISOString().slice(0, 7), purchaseId: purchase.id },
      }));
      await incrementDailyRollup(artistId, 'beatSales').catch(() => {});
      await incrementDailyRollup(artistId, 'totalRevenue', netAmount).catch(() => {});
    }
  } else if (purchase.itemType === 'release' && (purchase as any).releaseId) {
    const release = await prisma.release.findUnique({ where: { id: (purchase as any).releaseId }, include: { artist: { include: { user: true } } } });
    if (release) {
      itemName = release.title; artistEmail = release.artist.user.email;
      artistName = release.artist.name; artworkUrl = release.artworkUrl || ''; artistId = release.artist.id;
      licenseUrl = await issueLicensePdf(release.title, release.artist.name, 'release');
      txOps.push(prisma.release.update({ where: { id: release.id }, data: { sales: { increment: 1 } } }));
      txOps.push(prisma.revenueRecord.create({
        data: { artistId, type: 'release_sale', amount: purchase.amount, platformFee: platformFeeAmt, netAmount, currency: purchase.currency, period: new Date().toISOString().slice(0, 7), purchaseId: purchase.id },
      }));
      await incrementDailyRollup(artistId, 'releaseSales').catch(() => {});
      await incrementDailyRollup(artistId, 'totalRevenue', netAmount).catch(() => {});
    }
  } else if (purchase.itemType === 'video' && purchase.videoId) {
    const video = await prisma.video.findUnique({ where: { id: purchase.videoId }, include: { artist: { include: { user: true } } } });
    if (video) {
      itemName = video.title; artistEmail = video.artist.user.email;
      artistName = video.artist.name; artworkUrl = video.thumbnailUrl || ''; artistId = video.artist.id;
      licenseUrl = await issueLicensePdf(video.title, video.artist.name, 'video');
      txOps.push(prisma.video.update({ where: { id: video.id }, data: { sales: { increment: 1 } } }));
      await incrementDailyRollup(artistId, 'totalRevenue', netAmount).catch(() => {});
    }
  } else if (purchase.itemType === 'sample' && purchase.sampleId) {
    const sample = await prisma.sample.findUnique({ where: { id: purchase.sampleId }, include: { artist: { include: { user: true } } } });
    if (sample) {
      itemName = sample.title; artistEmail = sample.artist.user.email;
      artistName = sample.artist.name; artworkUrl = sample.artworkUrl || ''; artistId = sample.artist.id;
      licenseUrl = await issueLicensePdf(sample.title, sample.artist.name, 'sample');
      txOps.push(prisma.sample.update({ where: { id: sample.id }, data: { sales: { increment: 1 } } }));
      await incrementDailyRollup(artistId, 'totalRevenue', netAmount).catch(() => {});
    }
  } else if (purchase.itemType === 'merch' && (purchase as any).merchId) {
    const merch = await prisma.merch.findUnique({ where: { id: (purchase as any).merchId }, include: { artist: { include: { user: true } } } });
    if (merch) {
      itemName = merch.title; artistEmail = merch.artist.user.email;
      artistName = merch.artist.name; artworkUrl = merch.imageUrl || ''; artistId = merch.artist.id;
      txOps.push(prisma.merch.update({ where: { id: merch.id }, data: { stock: { decrement: 1 } } }));
      await incrementDailyRollup(artistId, 'totalRevenue', netAmount).catch(() => {});
    }
  }

  if (artistId) {
    txOps.push(prisma.artistPayout.create({
      data: { artistId, purchaseId: purchase.id, amount: netAmount, method: payoutMethod, currency: purchase.currency, status: 'pending', reference, notes: `${purchase.itemType} sale via ${payoutMethod === 'yoco' ? 'Yoco' : 'Paystack'} — ${itemName}` },
    }));

    if (pendingLifetimeSalesIncrement > 0) {
      txOps.push(prisma.artist.update({
        where: { id: artistId },
        data: { lifetimeGrossSales: { increment: pendingLifetimeSalesIncrement } },
      }));
    }
  }

  if (txOps.length > 0) {
    try {
      await prisma.$transaction(txOps);
    } catch (e) {
      logger.error('[purchase-confirmation] Ledger transaction failed — purchase confirmed but payout/counters may be incomplete', { traceId, purchaseId: purchase.id, artistId, payoutMethod, error: String(e) });
      await auditLog.securityEvent('security.invalid_download_attempt', `Ledger transaction failed for purchaseId=${purchase.id}, artistId=${artistId}: ${String(e)}`, payoutMethod).catch(() => {});
    }
  }

  if (artistId && pendingLifetimeSalesIncrement > 0) {
    checkAndAwardPlaques(artistId).catch(e =>
      logger.error('[purchase-confirmation] plaque check failed', { error: String(e) })
    );

    const splitItemId =
      purchase.itemType === 'beat' ? purchase.beatId :
      purchase.itemType === 'release' ? purchase.releaseId :
      purchase.itemType === 'video' ? purchase.videoId :
      purchase.itemType === 'sample' ? purchase.sampleId :
      purchase.itemType === 'merch' ? purchase.merchId :
      null;

    if (splitItemId) {
      disburseSplitSheet({
        itemType: purchase.itemType,
        itemId: splitItemId,
        purchaseId: purchase.id,
        grossAmount: purchase.amount,
        artistPlanSlug: undefined,
        artistPlanExpiry: undefined,
        lifetimeGrossSales: pendingLifetimeSalesIncrement,
      }).catch(e =>
        logger.error('[purchase-confirmation] split disburse failed', { error: String(e) })
      );
    }
  }

  await auditLog.purchaseConfirmed(purchase.id, itemName, purchase.amount, purchase.currency, purchase.buyerEmail);

  if (purchase.itemType === 'beat' || purchase.itemType === 'release') {
    createInvoiceFromPurchase(purchase.id).catch(e =>
      logger.error('[purchase-confirmation] invoice creation failed', { traceId, error: String(e) })
    );
  }

  const freshPurchase = await prisma.purchase.findUnique({ where: { id: purchase.id }, select: { receiptUrl: true } });
  if (freshPurchase?.receiptUrl !== 'email:sent') {
    try {
      await sendPurchaseConfirmation({ to: purchase.buyerEmail, buyerName: purchase.buyerName, itemName, itemType: purchase.itemType, licenseType: purchase.licenseType || undefined, downloadUrl, amount: purchase.amount, currency: purchase.currency, licenseId: purchase.licenseId, artworkUrl: artworkUrl || undefined, licenseUrl: licenseUrl || undefined });
      await prisma.purchase.update({ where: { id: purchase.id }, data: { receiptUrl: 'email:sent' } });
    } catch (e) { logger.error('[purchase-confirmation] Buyer email failed', { traceId, error: String(e) }); }
  }

  if (artistEmail) {
    try {
      await sendArtistSaleNotification({ to: artistEmail, artistName, buyerName: purchase.buyerName, itemName, licenseType: purchase.licenseType || undefined, amount: purchase.amount, currency: purchase.currency, dashboardUrl: `${appUrl}/dashboard`, planSlug: artistPlanSlug || undefined, planExpiresAt: artistPlanExpiresAt });
    } catch (e) { logger.error('[purchase-confirmation] Artist email failed', { traceId, error: String(e) }); }
  }

  logger.info('[purchase-confirmation] Purchase confirmed', { traceId, purchaseId: purchase.id, payoutMethod });
  return { ok: true };
}
