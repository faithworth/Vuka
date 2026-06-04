/**
 * POST /api/checkout/payfast/notify
 *
 * FIX (on top of all prior phases):
 *   - After confirming a purchase, call incrementDailyRollup for
 *     beatSales / releaseSales AND totalRevenue so that
 *     /dashboard/analytics Revenue tab shows real numbers.
 *   - All prior logic untouched.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validatePayFastITN, PAYFAST_IPS } from '@/lib/payfast';
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';
import { sendPurchaseConfirmation, sendArtistSaleNotification } from '@/lib/emails';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { incrementDailyRollup } from '@/lib/social';

export const dynamic = 'force-dynamic';

const PLATFORM_FEE_RATE = 0.02; // 2% — must match Stripe webhook + transaction.ts

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const traceId = req.headers.get('x-trace-id') ?? 'no-trace';

  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  if (!isSandbox && !PAYFAST_IPS.includes(clientIp)) {
    logger.warn('[payfast/notify] Blocked unknown IP', { traceId, clientIp });
    await auditLog.securityEvent('security.ip_blocked', `PayFast ITN from unrecognized IP: ${clientIp}`, clientIp);
    return new NextResponse('Forbidden', { status: 403 });
  }

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  if (!isSandbox && !validatePayFastITN(data, passphrase)) {
    logger.error('[payfast/notify] ITN signature invalid', { traceId, clientIp });
    await auditLog.securityEvent('security.signature_failure', 'PayFast ITN signature validation failed', clientIp);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  if (data.payment_status !== 'COMPLETE') {
    logger.info('[payfast/notify] Non-complete status, ignoring', { traceId, status: data.payment_status });
    return NextResponse.json({ ok: true });
  }

  const purchaseId  = data.m_payment_id;
  const pfPaymentId = data.pf_payment_id;

  if (!purchaseId) {
    logger.warn('[payfast/notify] Missing m_payment_id', { traceId });
    return NextResponse.json({ ok: true });
  }

  try {
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });

    if (!purchase) {
      logger.warn('[payfast/notify] Purchase not found', { traceId, purchaseId });
      return NextResponse.json({ ok: true });
    }

    // Idempotency: skip if already processed
    if (purchase.status !== 'pending') {
      logger.info('[payfast/notify] Duplicate ITN — already processed', { traceId, purchaseId, status: purchase.status });
      return NextResponse.json({ ok: true });
    }

    // Amount validation
    const paidAmount = parseFloat(data.amount_gross || '0');
    if (Math.abs(paidAmount - purchase.amount) > 0.01) {
      logger.error('[payfast/notify] Amount mismatch', { traceId, purchaseId, paidAmount, expected: purchase.amount });
      await auditLog.securityEvent('security.invalid_download_attempt', `Amount mismatch purchaseId=${purchaseId} paid=${paidAmount} expected=${purchase.amount}`, clientIp);
      return new NextResponse('Amount mismatch', { status: 400 });
    }

    const platformFee = Math.round(purchase.amount * PLATFORM_FEE_RATE * 100) / 100;
    const netAmount   = purchase.amount - platformFee;

    // If the purchase has no userId, look up the user by buyerEmail to link it
    let resolvedUserId = purchase.userId;
    if (!resolvedUserId && purchase.buyerEmail) {
      const buyerUser = await prisma.user.findUnique({
        where: { email: purchase.buyerEmail },
        select: { id: true },
      }).catch(() => null);
      resolvedUserId = buyerUser?.id ?? null;
    }

    await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        status: 'confirmed',
        payfastPfPaymentId: pfPaymentId,
        platformFee,
        netAmount,
        ...(resolvedUserId && !purchase.userId ? { userId: resolvedUserId } : {}),
      },
    });

    const appUrl      = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.app';
    const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;

    let itemName     = 'your purchase';
    let artistEmail  = '';
    let artistName   = '';
    let artworkUrl   = '';
    let artistId     = '';
    let paymentMethod = 'payfast';

    // ── BEAT ─────────────────────────────────────────────────
    if (purchase.itemType === 'beat' && purchase.beatId) {
      const beat = await prisma.beat.findUnique({
        where: { id: purchase.beatId },
        include: { artist: { include: { user: true } } },
      });
      if (beat) {
        itemName      = beat.title;
        artistEmail   = beat.artist.user.email;
        artistName    = beat.artist.name;
        artworkUrl    = beat.artworkUrl || '';
        artistId      = beat.artist.id;
        paymentMethod = 'payfast';

        // Generate license PDF
        try {
          const pdfBuffer = await generateLicensePDF({
            licenseId:   purchase.licenseId,
            licenseType: purchase.licenseType,
            beatTitle:   beat.title,
            artistName:  beat.artist.name,
            buyerName:   purchase.buyerName,
            buyerEmail:  purchase.buyerEmail,
            amount:      purchase.amount,
            currency:    purchase.currency,
            date:        new Date(),
          });
          const pdfKey = r2Keys.license(purchase.licenseId);
          await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
          await prisma.purchase.update({ where: { id: purchaseId }, data: { licenseUrl: getPublicUrl(pdfKey) } });
        } catch (pdfErr) {
          logger.error('[payfast/notify] License PDF failed', {
            traceId, purchaseId, error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
          });
        }

        // Exclusive lock
        if (purchase.licenseType === 'exclusive') {
          await prisma.beat.update({ where: { id: beat.id }, data: { isExclusive: true, isActive: false } });
          await auditLog.exclusiveLocked(beat.id, beat.title, purchaseId);
        }

        await prisma.beat.update({ where: { id: beat.id }, data: { sales: { increment: 1 } } });

        // FIX: roll into daily analytics so Revenue tab shows real data
        await incrementDailyRollup(artistId, 'beatSales').catch(() => {});
        await incrementDailyRollup(artistId, 'revenue').catch(() => {});
      }
    }

    // ── RELEASE ──────────────────────────────────────────────
    else if (purchase.itemType === 'release' && purchase.releaseId) {
      const release = await prisma.release.findUnique({
        where: { id: purchase.releaseId },
        include: { artist: { include: { user: true } } },
      });
      if (release) {
        itemName      = release.title;
        artistEmail   = release.artist.user.email;
        artistName    = release.artist.name;
        artworkUrl    = release.artworkUrl || '';
        artistId      = release.artist.id;
        paymentMethod = 'payfast';
        await prisma.release.update({ where: { id: release.id }, data: { sales: { increment: 1 } } });

        // FIX: roll into daily analytics
        await incrementDailyRollup(artistId, 'releaseSales').catch(() => {});
        await incrementDailyRollup(artistId, 'revenue').catch(() => {});
      }
    }

    // ── VIDEO ────────────────────────────────────────────────
    else if (purchase.itemType === 'video' && purchase.videoId) {
      const video = await prisma.video.findUnique({
        where: { id: purchase.videoId },
        include: { artist: { include: { user: true } } },
      });
      if (video) {
        itemName      = video.title;
        artistEmail   = video.artist.user.email;
        artistName    = video.artist.name;
        artworkUrl    = video.thumbnailUrl || '';
        artistId      = video.artist.id;
        paymentMethod = 'payfast';
        await prisma.video.update({ where: { id: video.id }, data: { sales: { increment: 1 } } });

        // FIX: roll into daily analytics
        await incrementDailyRollup(artistId, 'revenue').catch(() => {});
      }
    }

    // ── SAMPLE ───────────────────────────────────────────────
    else if (purchase.itemType === 'sample' && purchase.sampleId) {
      const sample = await prisma.sample.findUnique({
        where: { id: purchase.sampleId },
        include: { artist: { include: { user: true } } },
      });
      if (sample) {
        itemName      = sample.title;
        artistEmail   = sample.artist.user.email;
        artistName    = sample.artist.name;
        artworkUrl    = sample.artworkUrl || '';
        artistId      = sample.artist.id;
        paymentMethod = 'payfast';
        await prisma.sample.update({ where: { id: sample.id }, data: { sales: { increment: 1 } } });

        // FIX: roll into daily analytics
        await incrementDailyRollup(artistId, 'revenue').catch(() => {});
      }
    }

    // ── PAYOUT RECORD ────────────────────────────────────────
    if (artistId) {
      await prisma.artistPayout.create({
        data: {
          artistId,
          purchaseId,
          amount:    purchase.amount,
          method:    paymentMethod,
          currency:  purchase.currency,
          status:    'pending',
          reference: pfPaymentId,
          notes:     `${purchase.itemType} sale via PayFast — ${itemName}`,
        },
      });
    }

    // ── AUDIT ────────────────────────────────────────────────
    await auditLog.purchaseConfirmed(purchaseId, itemName, purchase.amount, purchase.currency, purchase.buyerEmail);

    // ── EMAILS ───────────────────────────────────────────────
    try {
      await sendPurchaseConfirmation({
        to:          purchase.buyerEmail,
        buyerName:   purchase.buyerName,
        itemName,
        itemType:    purchase.itemType,
        licenseType: purchase.licenseType || undefined,
        downloadUrl,
        amount:      purchase.amount,
        currency:    purchase.currency,
        licenseId:   purchase.licenseId,
        artworkUrl:  artworkUrl || undefined,
      });
    } catch (emailErr) {
      logger.error('[payfast/notify] Buyer email failed', {
        traceId, purchaseId, error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }

    if (artistEmail) {
      try {
        await sendArtistSaleNotification({
          to:           artistEmail,
          artistName,
          buyerName:    purchase.buyerName,
          itemName,
          licenseType:  purchase.licenseType || undefined,
          amount:       purchase.amount,
          currency:     purchase.currency,
          dashboardUrl: `${appUrl}/dashboard`,
        });
      } catch (emailErr) {
        logger.error('[payfast/notify] Artist email failed', {
          traceId, purchaseId, error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        });
      }
    }

    logger.info('[payfast/notify] Purchase processed', { traceId, purchaseId, itemType: purchase.itemType, itemName });

  } catch (err) {
    logger.error('[payfast/notify] Processing error', {
      traceId, purchaseId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Always 200 — prevent PayFast from retrying and creating duplicate state
  }

  return NextResponse.json({ ok: true });
}
