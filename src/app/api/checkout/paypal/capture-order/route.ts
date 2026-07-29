
/**
 * POST /api/checkout/paypal/capture-order
 *
 * Mirrors the Paystack webhook handler — every post-sale side effect that
 * Paystack runs on charge.success runs here on capture.
 *
 * Called by /checkout/paypal/return after PayPal redirects the buyer back.
 * create-order already created a pending Purchase row and stored the PayPal
 * orderId in paystackReference (`paypal:<orderId>`), so we look it up here
 * for idempotency rather than re-resolving the item from scratch.
 *
 * Side effects (same as Paystack webhook):
 *   ✓ Purchase confirmed with platformFee + netAmount
 *   ✓ userId resolved from email if not already set
 *   ✓ PDF license generated + uploaded to R2 for ALL item types (beat,
 *     release, video, sample), licenseUrl stored — previously beat-only,
 *     same gap fixed in the Paystack webhook via issueLicensePdf(itemKind)
 *   ✓ Beat exclusive: isExclusive=true, isActive=false
 *   ✓ Sales counter incremented on item
 *   ✓ Artist lifetimeGrossSales incremented
 *   ✓ ArtistPayout record created (pending)
 *   ✓ DailyRollup incremented
 *   ✓ SplitSheet disbursed if one exists
 *   ✓ Plaques checked
 *   ✓ Buyer confirmation email sent (with license PDF link for all types)
 *   ✓ Artist sale notification email sent
 *   ✓ Audit log written
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import paypal from '@/lib/paypal';
import { getZarToUsdRate } from '@/lib/fx';
import { platformFee as calcPlatformFee } from '@/lib/plans';
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';
import { sendPurchaseConfirmation, sendArtistSaleNotification } from '@/lib/emails';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/monitoring/sentry';
import { incrementDailyRollup } from '@/lib/social';
import { checkAndAwardPlaques } from '@/lib/plaques';
import { disburseSplitSheet } from '@/lib/splits';
import { issueBeatLicense } from '@/lib/licensing';
import { createInvoiceFromPurchase } from '@/lib/invoices';
import crypto from 'crypto';

const schema = z.object({
  orderId:     z.string().min(1),
  purchaseId:  z.string().min(1),   // DB id from create-order (preferred)
  itemType:    z.enum(['beat', 'release', 'video', 'sample']),
  itemId:      z.string().min(1),
  buyerName:   z.string().min(1).max(200).trim(),
  buyerEmail:  z.string().email().max(254).trim().toLowerCase(),
});

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();
  const ip      = getClientIp(req.headers);

  const limited = await rateLimit(ip, RATE_LIMITS.checkout_init, ip);
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { orderId, purchaseId, buyerName, buyerEmail } = parsed.data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vukamusic.com';

  // ── Load the pending Purchase created by create-order ──────────────────
  const purchaseOrNull = await prisma.purchase.findFirst({
    where: {
      OR: [
        { id: purchaseId },
        { paystackReference: `paypal:${orderId}` },
      ],
    },
  });

  if (!purchaseOrNull) {
    logger.error('[PayPal capture] Purchase not found', { traceId, orderId, purchaseId });
    return NextResponse.json({ error: 'Purchase record not found. Contact support.' }, { status: 404 });
  }

  // Narrowed, non-null purchase reference — used everywhere below,
  // including inside the nested issueLicensePdf closure, to avoid TS18047
  // (same pattern as the Paystack webhook fix).
  const purchase = purchaseOrNull;

  // ── Idempotency ─────────────────────────────────────────────────────────
  if (purchase.status === 'confirmed') {
    return NextResponse.json({
      ok:          true,
      purchaseId:  purchase.id,
      downloadUrl: `${appUrl}/download/${purchase.downloadToken}`,
      duplicate:   true,
    });
  }

  if (purchase.status !== 'pending') {
    return NextResponse.json(
      { error: `Purchase is in unexpected state: ${purchase.status}` },
      { status: 409 }
    );
  }

  // ── Capture the PayPal order ────────────────────────────────────────────
  let captureResult;
  try {
    captureResult = await paypal.orders.capture(orderId, `vuka-capture-${orderId}`);
  } catch (err) {
    captureException(err, { action: 'paypal-capture', traceId, orderId });
    logger.error('[PayPal capture] Capture failed', { err, traceId, orderId });
    return NextResponse.json(
      { error: 'PayPal capture failed. If you were charged, contact support.' },
      { status: 502 }
    );
  }

  if (captureResult.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: `Payment not completed (status: ${captureResult.status})` },
      { status: 402 }
    );
  }

  const capture   = captureResult.purchase_units?.[0]?.payments?.captures?.[0];
  const amountUSD = parseFloat(capture?.amount?.value ?? '0');
  const paypalFeeUSD = parseFloat(
    capture?.seller_receivable_breakdown?.paypal_fee?.value ?? '0'
  );

  // ── Resolve artist plan for correct fee tier ────────────────────────────
  let artistPlanSlug:    string | null = null;
  let artistPlanExpiry:  Date | null   = null;
  let artistName  = '';
  let artistEmail = '';
  let artistId    = purchase.artistId ?? '';

  if (purchase.beatId) {
    const beat = await prisma.beat.findUnique({
      where:   { id: purchase.beatId },
      include: { artist: { include: { user: true } } },
    });
    if (beat) {
      artistPlanSlug   = beat.artist.planSlug;
      artistPlanExpiry = beat.artist.planExpiresAt;
      artistName       = beat.artist.name;
      artistEmail      = beat.artist.user.email;
      artistId         = beat.artist.id;
    }
  } else if (purchase.releaseId) {
    const release = await prisma.release.findUnique({
      where:   { id: purchase.releaseId },
      include: { artist: { include: { user: true } } },
    });
    if (release) {
      artistPlanSlug   = release.artist.planSlug;
      artistPlanExpiry = release.artist.planExpiresAt;
      artistName       = release.artist.name;
      artistEmail      = release.artist.user.email;
      artistId         = release.artist.id;
    }
  } else if (purchase.videoId) {
    const video = await prisma.video.findUnique({
      where:   { id: purchase.videoId },
      include: { artist: { include: { user: true } } },
    });
    if (video) {
      artistPlanSlug   = video.artist.planSlug;
      artistPlanExpiry = video.artist.planExpiresAt;
      artistName       = video.artist.name;
      artistEmail      = video.artist.user.email;
      artistId         = video.artist.id;
    }
  } else if (purchase.sampleId) {
    const sample = await prisma.sample.findUnique({
      where:   { id: purchase.sampleId },
      include: { artist: { include: { user: true } } },
    });
    if (sample) {
      artistPlanSlug   = sample.artist.planSlug;
      artistPlanExpiry = sample.artist.planExpiresAt;
      artistName       = sample.artist.name;
      artistEmail      = sample.artist.user.email;
      artistId         = sample.artist.id;
    }
  }

  const platformFeeAmt = calcPlatformFee(purchase.amount, artistPlanSlug, artistPlanExpiry);
  const netAmount      = Math.round((purchase.amount - platformFeeAmt) * 100) / 100;

  // ── Live FX rate (record-keeping only) ─────────────────────────────────
  const fx     = await getZarToUsdRate().catch(() => ({ zarToUsdRate: 0.054, source: 'fallback' }));
  const fxRate = fx.zarToUsdRate;

  // ── Resolve userId from email if missing ────────────────────────────────
  let resolvedUserId = purchase.userId;
  if (!resolvedUserId && purchase.buyerEmail) {
    const buyer = await prisma.user.findUnique({
      where:  { email: purchase.buyerEmail },
      select: { id: true },
    }).catch(() => null);
    resolvedUserId = buyer?.id ?? null;
  }

  // ── Confirm the Purchase ────────────────────────────────────────────────
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      status:      'confirmed',
      buyerName,   // update in case they typed a different name in the modal
      buyerEmail,
      platformFee: platformFeeAmt,
      netAmount,
      paystackReference: `paypal:${orderId}`,
      ...(resolvedUserId && !purchase.userId ? { userId: resolvedUserId } : {}),
    },
  });

  // ── Post-sale side effects (fire-and-forget non-critical paths) ─────────
  const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;
  let   itemTitle   = purchase.itemType;
  let   artworkUrl  = '';
  let   licenseUrl  = '';

  // Generates + uploads a license PDF for any item type (previously
  // beat-only, mirroring the same fix already applied to the Paystack
  // webhook). Buyers can pick a licenseType for release/video/sample
  // purchases too, so those PayPal buyers were charged for a license but
  // never received the document.
  async function issueLicensePdf(title: string, itemArtistName: string, itemKind: 'beat' | 'release' | 'video' | 'sample') {
    try {
      const pdfBuffer = await generateLicensePDF({
        licenseId:   purchase.licenseId,
        licenseType: purchase.licenseType || 'standard',
        beatTitle:   title,
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
      logger.error('[PayPal capture] PDF generation failed', { traceId, error: String(e) });
      return '';
    }
  }

  try {
    // ── Beat-specific: PDF license + exclusive lock ───────────────────────
    if (purchase.itemType === 'beat' && purchase.beatId) {
      const beat = await prisma.beat.findUnique({
        where:   { id: purchase.beatId },
        include: { artist: { include: { user: true } } },
      });
      if (beat) {
        itemTitle  = `${beat.title} (${purchase.licenseType || 'Basic'} License)`;
        artworkUrl = beat.artworkUrl || '';
        licenseUrl = await issueLicensePdf(beat.title, beat.artist.name, 'beat');
        issueBeatLicense({
          purchaseId: purchase.id,
          buyerName:  purchase.buyerName,
          buyerEmail: purchase.buyerEmail,
          artistName: beat.artist.name,
          songTitle:  beat.title,
        }).catch(e => logger.error('[PayPal capture] beat license key issuance failed', { traceId, error: String(e) }));

        // Lock exclusive beat
        if (purchase.licenseType === 'exclusive') {
          await prisma.beat.update({
            where: { id: beat.id },
            data:  { isExclusive: true, isActive: false },
          });
          await auditLog.exclusiveLocked(beat.id, beat.title, purchase.id);
        }

        await prisma.beat.update({ where: { id: beat.id }, data: { sales: { increment: 1 } } });
        await prisma.revenueRecord.create({
          data: { artistId, type: 'beat_sale', amount: purchase.amount, platformFee: platformFeeAmt, netAmount, currency: purchase.currency, period: new Date().toISOString().slice(0, 7), purchaseId: purchase.id },
        }).catch(e => logger.error('[PayPal capture] revenue record failed', { error: String(e) }));
        await incrementDailyRollup(artistId, 'beatSales').catch(() => {});
      }
    }

    // ── Release ───────────────────────────────────────────────────────────
    if (purchase.itemType === 'release' && purchase.releaseId) {
      const release = await prisma.release.findUnique({
        where:   { id: purchase.releaseId },
        select:  { title: true, artworkUrl: true, artist: { select: { name: true } } },
      });
      if (release) {
        itemTitle  = release.title;
        artworkUrl = release.artworkUrl || '';
        licenseUrl = await issueLicensePdf(release.title, release.artist.name, 'release');
        await prisma.release.update({ where: { id: purchase.releaseId }, data: { sales: { increment: 1 } } });
        await prisma.revenueRecord.create({
          data: { artistId, type: 'release_sale', amount: purchase.amount, platformFee: platformFeeAmt, netAmount, currency: purchase.currency, period: new Date().toISOString().slice(0, 7), purchaseId: purchase.id },
        }).catch(e => logger.error('[PayPal capture] revenue record failed', { error: String(e) }));
        await incrementDailyRollup(artistId, 'releaseSales').catch(() => {});
      }
    }

    // ── Video ─────────────────────────────────────────────────────────────
    if (purchase.itemType === 'video' && purchase.videoId) {
      const video = await prisma.video.findUnique({
        where:  { id: purchase.videoId },
        select: { title: true, thumbnailUrl: true, artist: { select: { name: true } } },
      });
      if (video) {
        itemTitle  = video.title;
        artworkUrl = video.thumbnailUrl || '';
        licenseUrl = await issueLicensePdf(video.title, video.artist.name, 'video');
        await prisma.video.update({ where: { id: purchase.videoId }, data: { sales: { increment: 1 } } });
      }
    }

    // ── Sample ────────────────────────────────────────────────────────────
    if (purchase.itemType === 'sample' && purchase.sampleId) {
      const sample = await prisma.sample.findUnique({
        where:  { id: purchase.sampleId },
        select: { title: true, artworkUrl: true, artist: { select: { name: true } } },
      });
      if (sample) {
        itemTitle  = sample.title;
        artworkUrl = sample.artworkUrl || '';
        licenseUrl = await issueLicensePdf(sample.title, sample.artist.name, 'sample');
        await prisma.sample.update({ where: { id: purchase.sampleId }, data: { sales: { increment: 1 } } });
      }
    }

    await incrementDailyRollup(artistId, 'totalRevenue', netAmount).catch(() => {});

    // ── ArtistPayout record ────────────────────────────────────────────────
    if (artistId) {
      await prisma.artistPayout.create({
        data: {
          artistId,
          purchaseId: purchase.id,
          amount:     netAmount,
          method:     'paypal',
          currency:   'USD',     // PayPal payouts are in USD
          status:     'pending',
          reference:  `paypal:${orderId}`,
          notes:      `${purchase.itemType} sale via PayPal — ${itemTitle}`,
        },
      });

      // ── Lifetime gross sales + plaques ───────────────────────────────────
      await prisma.artist.update({
        where: { id: artistId },
        data:  { lifetimeGrossSales: { increment: purchase.amount } },
      }).catch(e => logger.error('[PayPal capture] lifetimeGrossSales increment failed', { error: String(e) }));

      checkAndAwardPlaques(artistId).catch(e =>
        logger.error('[PayPal capture] plaque check failed', { error: String(e) })
      );

      // ── Split sheet disbursement ──────────────────────────────────────────
      const splitItemId =
        purchase.itemType === 'beat'    ? purchase.beatId :
        purchase.itemType === 'release' ? purchase.releaseId :
        purchase.itemType === 'video'   ? purchase.videoId :
        purchase.itemType === 'sample'  ? purchase.sampleId :
        null;

      if (splitItemId) {
        disburseSplitSheet({
          itemType:            purchase.itemType,
          itemId:              splitItemId,
          purchaseId:          purchase.id,
          grossAmount:         purchase.amount,
          artistPlanSlug:      artistPlanSlug ?? undefined,
          artistPlanExpiry:    artistPlanExpiry ?? undefined,
          lifetimeGrossSales:  purchase.amount,
        }).catch(e =>
          logger.error('[PayPal capture] split disburse failed', { error: String(e) })
        );
      }
    }

  } catch (err) {
    // Side effects failing must never block the buyer from getting their download
    captureException(err, { action: 'paypal-capture-side-effects', traceId, purchaseId: purchase.id });
    logger.error('[PayPal capture] Side effect error', { err, traceId });
  }

  // ── Emails ──────────────────────────────────────────────────────────────
  try {
    await sendPurchaseConfirmation({
      to:          buyerEmail,
      buyerName,
      itemName:    itemTitle,
      itemType:    purchase.itemType,
      licenseType: purchase.licenseType || undefined,
      downloadUrl,
      amount:      purchase.amount,
      currency:    purchase.currency,
      licenseId:   purchase.licenseId,
      artworkUrl:  artworkUrl || undefined,
      licenseUrl:  licenseUrl || undefined,
    });
  } catch (e) {
    logger.warn('[PayPal capture] Buyer email failed — purchase still OK', { e, traceId });
  }

  if (artistEmail) {
    try {
      await sendArtistSaleNotification({
        to:           artistEmail,
        artistName,
        buyerName,
        itemName:     itemTitle,
        licenseType:  purchase.licenseType || undefined,
        amount:       purchase.amount,
        currency:     purchase.currency,
        dashboardUrl: `${appUrl}/dashboard`,
        planSlug:     artistPlanSlug ?? undefined,
      });
    } catch (e) {
      logger.warn('[PayPal capture] Artist email failed', { e, traceId });
    }
  }

  // ── Audit ───────────────────────────────────────────────────────────────
  await auditLog.purchaseConfirmed(
    purchase.id, itemTitle, purchase.amount, purchase.currency, buyerEmail
  );

  if (purchase.itemType === 'beat' || purchase.itemType === 'release') {
    createInvoiceFromPurchase(purchase.id).catch(e =>
      logger.error('[PayPal capture] invoice creation failed', { traceId, error: String(e) })
    );
  }

  logger.info('[PayPal capture] Purchase confirmed', {
    traceId, purchaseId: purchase.id, orderId, amountUSD, priceZAR: purchase.amount, fxRate, paypalFeeUSD,
  });

  return NextResponse.json({
    ok:          true,
    purchaseId:  purchase.id,
    downloadUrl,
    reference:   orderId,
  });
}
