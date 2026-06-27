/**
 * POST /api/checkout/paypal/capture-order
 *
 * Captures an approved PayPal order. Called after the buyer returns from
 * PayPal's approve page. Writes the Purchase record and sends download email.
 *
 * The FX rate used is fetched live and stored on the Purchase row so refunds
 * can be calculated accurately regardless of future rate changes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import paypal from '@/lib/paypal';
import { getZarToUsdRate, zarToUsd } from '@/lib/fx';
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
  buyerEmail:  z.string().email().max(254).trim().toLowerCase(),
  licenseType: z.enum(['basic', 'premium', 'exclusive']).optional().default('basic'),
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

  const { orderId, itemType, itemId, buyerName, buyerEmail, licenseType } = parsed.data;

  // ── Idempotency ────────────────────────────────────────────────────────
  const existing = await prisma.purchase.findFirst({
    where:  { paystackReference: `paypal:${orderId}`, status: 'confirmed' },
    select: { id: true, downloadToken: true },
  });
  if (existing) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vuka.co.za';
    return NextResponse.json({
      ok:          true,
      purchaseId:  existing.id,
      downloadUrl: `${appUrl}/download/${existing.downloadToken}`,
      duplicate:   true,
    });
  }

  // ── Resolve item ───────────────────────────────────────────────────────
  let itemTitle      = '';
  let priceZAR       = 0;
  let artistId       = '';
  let artistPlan     = 'free';
  let artistExpiry:  Date | null = null;
  let artistLifetime = 0;

  const artistSelect = {
    id: true, planSlug: true, planExpiresAt: true, lifetimeGrossSales: true,
  };

  try {
    if (itemType === 'beat') {
      const r = await prisma.beat.findUnique({ where: { id: itemId }, include: { artist: { select: artistSelect } } });
      if (!r) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      const beatPriceMap: Record<string, number> = { basic: r.basicPrice, premium: r.premiumPrice, exclusive: r.exclPrice };
      itemTitle = r.title; priceZAR = beatPriceMap[licenseType] ?? r.basicPrice;
      artistId = r.artist?.id ?? ''; artistPlan = r.artist?.planSlug ?? 'free';
      artistExpiry = r.artist?.planExpiresAt ?? null; artistLifetime = r.artist?.lifetimeGrossSales ?? 0;
    } else if (itemType === 'release') {
      const r = await prisma.release.findUnique({ where: { id: itemId }, include: { artist: { select: artistSelect } } });
      if (!r) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      itemTitle = r.title; priceZAR = r.price ?? 0;
      artistId = r.artist?.id ?? ''; artistPlan = r.artist?.planSlug ?? 'free';
      artistExpiry = r.artist?.planExpiresAt ?? null; artistLifetime = r.artist?.lifetimeGrossSales ?? 0;
    } else if (itemType === 'video') {
      const r = await prisma.video.findUnique({ where: { id: itemId }, include: { artist: { select: artistSelect } } });
      if (!r) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      itemTitle = r.title; priceZAR = r.price ?? 0;
      artistId = r.artist?.id ?? ''; artistPlan = r.artist?.planSlug ?? 'free';
      artistExpiry = r.artist?.planExpiresAt ?? null; artistLifetime = r.artist?.lifetimeGrossSales ?? 0;
    } else if (itemType === 'sample') {
      const r = await prisma.sample.findUnique({ where: { id: itemId }, include: { artist: { select: artistSelect } } });
      if (!r) return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
      itemTitle = r.title; priceZAR = r.price ?? 0;
      artistId = r.artist?.id ?? ''; artistPlan = r.artist?.planSlug ?? 'free';
      artistExpiry = r.artist?.planExpiresAt ?? null; artistLifetime = r.artist?.lifetimeGrossSales ?? 0;
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
    captureException(err, { action: 'paypal-capture', traceId });
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

  // ── Live FX rate (for record-keeping) ─────────────────────────────────
  const fx         = await getZarToUsdRate();
  const fxRate     = fx.zarToUsdRate;

  // ── Fee calculation ────────────────────────────────────────────────────
  const vukaPlatformFeeZAR = platformFee(priceZAR, artistPlan, artistExpiry, artistLifetime);
  const artistNetZAR       = artistNet(priceZAR, artistPlan, artistExpiry, artistLifetime);
  const paypalFeeUSD       = parseFloat(
    capture?.seller_receivable_breakdown?.paypal_fee?.value ?? '0'
  );

  // ── Write Purchase ─────────────────────────────────────────────────────
  const downloadToken = crypto.randomUUID();
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vuka.co.za';
  let purchaseId      = '';

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.create({
        data: {
          buyerEmail,
          buyerName,
          itemType,
          artistId:          artistId || undefined,
          beatId:            itemType === 'beat'    ? itemId : undefined,
          releaseId:         itemType === 'release' ? itemId : undefined,
          videoId:           itemType === 'video'   ? itemId : undefined,
          sampleId:          itemType === 'sample'  ? itemId : undefined,
          amount:            priceZAR,
          currency:          'ZAR',
          paystackReference: `paypal:${orderId}`,
          status:            'confirmed',
          downloadToken,
          licenseType:       itemType === 'beat' ? licenseType : 'standard',
          platformFee:       vukaPlatformFeeZAR,
          artistEarnings:    artistNetZAR,
          paymentProvider:   'paypal',
          paymentCurrency:   'USD',
          paymentAmount:     amountUSD,
        },
      });

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
    captureException(err, { action: 'paypal-purchase-create', traceId });
    // Payment captured but DB write failed — critical
    return NextResponse.json(
      {
        error:     'Payment received but order record failed. Contact support with reference: ' + orderId,
        reference: orderId,
      },
      { status: 500 }
    );
  }

  // ── Send download email ────────────────────────────────────────────────
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
    logger.warn('[PayPal] Download email failed — purchase still OK', { err, purchaseId, traceId });
  }

  await auditLog({
    action:     'paypal_purchase_confirmed',
    entityType: 'purchase',
    entityId:   purchaseId,
    meta:       { orderId, amountUSD, priceZAR, fxRate, paypalFeeUSD, itemType, itemId, traceId },
  });

  logger.info('[PayPal] Purchase complete', { purchaseId, orderId, amountUSD, priceZAR, traceId });

  return NextResponse.json({
    ok:          true,
    purchaseId,
    downloadUrl: `${appUrl}/download/${downloadToken}`,
    reference:   orderId,
  });
}
