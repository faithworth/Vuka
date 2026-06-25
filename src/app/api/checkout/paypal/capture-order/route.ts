/**
 * POST /api/checkout/paypal/capture-order
 *
 * Captures an approved PayPal order. Called after the buyer returns from
 * PayPal's approve page. Creates the Purchase record and triggers the
 * download email exactly like the Paystack flow.
 *
 * Body:
 *   orderId   — PayPal order ID from create-order
 *   itemType  — 'beat' | 'release' | 'video' | 'sample'
 *   itemId    — cuid of the item
 *   buyerName — buyer's display name
 *   buyerEmail — buyer's email (for download delivery)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import paypal, { zarToUsd } from '@/lib/paypal';
import { platformFee, artistNet } from '@/lib/plans';
import { sendPurchaseConfirmation } from '@/lib/emails';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/monitoring/sentry';
import crypto from 'crypto';

const schema = z.object({
  orderId:    z.string().min(1),
  itemType:   z.enum(['beat', 'release', 'video', 'sample']),
  itemId:     z.string().min(1),
  buyerName:  z.string().min(1).max(200).trim(),
  buyerEmail: z.string().email().max(254).trim().toLowerCase(),
});

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();
  const ip      = getClientIp(req);

  const limited = await rateLimit(ip, RATE_LIMITS.checkout_init, ip);
  if (limited) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

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

  const { orderId, itemType, itemId, buyerName, buyerEmail } = parsed.data;

  // ── Idempotency: reject duplicate captures ─────────────────────────────
  const existing = await prisma.purchase.findFirst({
    where: { paystackReference: `paypal:${orderId}`, status: 'confirmed' },
    select: { id: true, downloadToken: true },
  });
  if (existing) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vuka.co.za';
    return NextResponse.json({
      ok:           true,
      purchaseId:   existing.id,
      downloadUrl:  `${appUrl}/download/${existing.downloadToken}`,
      duplicate:    true,
    });
  }

  // ── Resolve item ───────────────────────────────────────────────────────
  let itemTitle   = '';
  let priceZAR    = 0;
  let artistId    = '';
  let artistPlan  = 'free';
  let artistExpiry: Date | null = null;
  let artistLifetime = 0;

  try {
    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: itemId },
        include: {
          artist: {
            select: {
              id: true, planSlug: true, planExpiresAt: true, lifetimeGrossSales: true,
            },
          },
        },
      });
      if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      itemTitle      = beat.title;
      priceZAR       = beat.price;
      artistId       = beat.artist?.id ?? '';
      artistPlan     = beat.artist?.planSlug ?? 'free';
      artistExpiry   = beat.artist?.planExpiresAt ?? null;
      artistLifetime = beat.artist?.lifetimeGrossSales ?? 0;

    } else if (itemType === 'release') {
      const release = await prisma.release.findUnique({
        where: { id: itemId },
        include: { artist: { select: { id: true, planSlug: true, planExpiresAt: true, lifetimeGrossSales: true } } },
      });
      if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      itemTitle      = release.title;
      priceZAR       = release.price ?? 0;
      artistId       = release.artist?.id ?? '';
      artistPlan     = release.artist?.planSlug ?? 'free';
      artistExpiry   = release.artist?.planExpiresAt ?? null;
      artistLifetime = release.artist?.lifetimeGrossSales ?? 0;

    } else if (itemType === 'video') {
      const video = await prisma.video.findUnique({
        where: { id: itemId },
        include: { artist: { select: { id: true, planSlug: true, planExpiresAt: true, lifetimeGrossSales: true } } },
      });
      if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      itemTitle      = video.title;
      priceZAR       = video.price ?? 0;
      artistId       = video.artist?.id ?? '';
      artistPlan     = video.artist?.planSlug ?? 'free';
      artistExpiry   = video.artist?.planExpiresAt ?? null;
      artistLifetime = video.artist?.lifetimeGrossSales ?? 0;

    } else if (itemType === 'sample') {
      const sample = await prisma.sample.findUnique({
        where: { id: itemId },
        include: { artist: { select: { id: true, planSlug: true, planExpiresAt: true, lifetimeGrossSales: true } } },
      });
      if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
      itemTitle      = sample.title;
      priceZAR       = sample.price ?? 0;
      artistId       = sample.artist?.id ?? '';
      artistPlan     = sample.artist?.planSlug ?? 'free';
      artistExpiry   = sample.artist?.planExpiresAt ?? null;
      artistLifetime = sample.artist?.lifetimeGrossSales ?? 0;
    }
  } catch (err) {
    captureException(err, { action: 'paypal-capture-lookup', traceId });
    return NextResponse.json({ error: 'Failed to load item' }, { status: 500 });
  }

  // ── Capture the PayPal order ───────────────────────────────────────────
  let captureResult;
  try {
    captureResult = await paypal.orders.capture(orderId, `vuka-capture-${orderId}`);
  } catch (err) {
    captureException(err, { action: 'paypal-capture', orderId, traceId });
    logger.error('[PayPal] Capture failed', { err, orderId, traceId });
    return NextResponse.json(
      { error: 'PayPal capture failed. If you were charged, contact support.' },
      { status: 502 }
    );
  }

  if (captureResult.status !== 'COMPLETED') {
    logger.warn('[PayPal] Capture not completed', {
      status: captureResult.status, orderId, traceId,
    });
    return NextResponse.json(
      { error: `Payment not completed (status: ${captureResult.status})` },
      { status: 402 }
    );
  }

  // ── Extract payment details ────────────────────────────────────────────
  const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];
  const amountUSD = parseFloat(capture?.amount?.value ?? '0');

  // ── Calculate fees ────────────────────────────────────────────────────
  const vukaPlatformFeeZAR  = platformFee(priceZAR, artistPlan, artistExpiry, artistLifetime);
  const artistNetZAR        = artistNet(priceZAR, artistPlan, artistExpiry, artistLifetime);
  const paypalFeeUSD        = parseFloat(
    capture?.seller_receivable_breakdown?.paypal_fee?.value ?? '0'
  );

  // ── Create Purchase record ─────────────────────────────────────────────
  const downloadToken = crypto.randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vuka.co.za';

  let purchaseId = '';
  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.create({
        data: {
          buyerEmail,
          buyerName,
          itemType,
          artistId:          artistId || null,
          beatId:            itemType === 'beat'    ? itemId : undefined,
          releaseId:         itemType === 'release' ? itemId : undefined,
          videoId:           itemType === 'video'   ? itemId : undefined,
          sampleId:          itemType === 'sample'  ? itemId : undefined,
          amount:            priceZAR,
          currency:          'ZAR',
          // Store paypal: prefix so we can distinguish from Paystack refs
          paystackReference: `paypal:${orderId}`,
          status:            'confirmed',
          downloadToken,
          licenseType:       'standard',
          platformFee:       vukaPlatformFeeZAR,
          artistEarnings:    artistNetZAR,
          paymentProvider:   'paypal',
          paymentCurrency:   'USD',
          paymentAmount:     amountUSD,
        },
      });

      // Update artist lifetime gross for fee-stepping
      if (artistId) {
        await tx.artist.update({
          where: { id: artistId },
          data:  { lifetimeGrossSales: { increment: priceZAR } },
        });
      }

      return p;
    });

    purchaseId = purchase.id;
  } catch (err) {
    captureException(err, { action: 'paypal-purchase-create', orderId, traceId });
    logger.error('[PayPal] Purchase DB write failed', { err, orderId, traceId });
    // Payment was captured but DB write failed — critical, needs manual review
    return NextResponse.json(
      {
        error: 'Payment received but order record failed. Contact support with reference: ' + orderId,
        reference: orderId,
      },
      { status: 500 }
    );
  }

  // ── Send download email ───────────────────────────────────────────────
  try {
    await sendPurchaseConfirmation({
      to:          buyerEmail,
      buyerName,
      itemTitle,
      itemType,
      downloadUrl: `${appUrl}/download/${downloadToken}`,
      amount:      priceZAR,
      currency:    'ZAR',
      reference:   orderId,
    });
  } catch (err) {
    logger.warn('[PayPal] Download email failed — purchase still OK', {
      err, purchaseId, traceId,
    });
  }

  await auditLog({
    action:    'paypal_purchase_confirmed',
    entityType: 'purchase',
    entityId:  purchaseId,
    meta:      { orderId, amountUSD, priceZAR, paypalFeeUSD, itemType, itemId, traceId },
  });

  logger.info('[PayPal] Purchase complete', {
    purchaseId, orderId, amountUSD, priceZAR, traceId,
  });

  return NextResponse.json({
    ok:          true,
    purchaseId,
    downloadUrl: `${appUrl}/download/${downloadToken}`,
    reference:   orderId,
  });
}
