/**
 * POST /api/checkout/paypal/create-order
 *
 * Mirrors /api/checkout/paystack/initialize for international buyers.
 * Creates a pending Purchase row, then a PayPal order, then stores the
 * PayPal orderId on the Purchase so capture-order can look it up and
 * confirm it without re-resolving the item.
 *
 * Flow:
 *   BuyModal → POST create-order → Purchase(pending) + PayPal order
 *   → buyer approves on paypal.com → return page → POST capture-order
 *   → Purchase(confirmed) + all post-sale side effects
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import paypal, { isPayPalConfigured, getApproveUrl } from '@/lib/paypal';
import { getZarToUsdRate, zarToUsd } from '@/lib/fx';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const schema = z.object({
  itemType:    z.enum(['beat', 'release', 'video', 'sample']),
  itemId:      z.string().min(1),
  buyerEmail:  z.string().email().max(254).trim().toLowerCase().optional(),
  buyerName:   z.string().min(1).max(200).trim().optional(),
  licenseType: z.enum(['basic', 'premium', 'exclusive']).optional().default('basic'),
  userId:      z.string().optional(),
});

const artistSelect = {
  id: true, name: true, planSlug: true, planExpiresAt: true,
  lifetimeGrossSales: true, user: { select: { email: true } },
};

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();
  const ip      = getClientIp(req.headers);

  if (!isPayPalConfigured()) {
    return NextResponse.json(
      { error: 'PayPal payments are not available at this time.' },
      { status: 503 }
    );
  }

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

  const { itemType, itemId, buyerEmail, buyerName, licenseType, userId } = parsed.data;

  // ── Resolve item, price, and artist ────────────────────────────────────
  let itemTitle   = '';
  let priceZAR    = 0;
  let artistName  = '';
  let artistEmail = '';
  let artistId    = '';

  try {
    if (itemType === 'beat') {
      const r = await prisma.beat.findUnique({
        where:   { id: itemId, isActive: true },
        include: { artist: { select: artistSelect } },
      });
      if (!r)             return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      if (r.isExclusive)  return NextResponse.json({ error: 'Beat already sold exclusively' }, { status: 400 });
      const priceMap: Record<string, number> = { basic: r.basicPrice, premium: r.premiumPrice, exclusive: r.exclPrice };
      itemTitle   = `${r.title} (${licenseType.charAt(0).toUpperCase() + licenseType.slice(1)} License)`;
      priceZAR    = priceMap[licenseType] ?? r.basicPrice;
      artistName  = r.artist?.name ?? '';
      artistEmail = r.artist?.user?.email ?? '';
      artistId    = r.artist?.id ?? '';

    } else if (itemType === 'release') {
      const r = await prisma.release.findUnique({
        where:   { id: itemId },
        include: { artist: { select: artistSelect } },
      });
      if (!r?.isActive) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      itemTitle   = r.title;
      priceZAR    = r.price ?? 0;
      artistName  = r.artist?.name ?? '';
      artistEmail = r.artist?.user?.email ?? '';
      artistId    = r.artist?.id ?? '';

    } else if (itemType === 'video') {
      const r = await prisma.video.findUnique({
        where:   { id: itemId },
        include: { artist: { select: artistSelect } },
      });
      if (!r?.isActive) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      itemTitle   = r.title;
      priceZAR    = r.price ?? 0;
      artistName  = r.artist?.name ?? '';
      artistEmail = r.artist?.user?.email ?? '';
      artistId    = r.artist?.id ?? '';

    } else if (itemType === 'sample') {
      const r = await prisma.sample.findUnique({
        where:   { id: itemId },
        include: { artist: { select: artistSelect } },
      });
      if (!r?.isActive) return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
      itemTitle   = r.title;
      priceZAR    = r.price ?? 0;
      artistName  = r.artist?.name ?? '';
      artistEmail = r.artist?.user?.email ?? '';
      artistId    = r.artist?.id ?? '';
    }
  } catch (err) {
    logger.error('[PayPal create-order] DB lookup failed', { err, traceId });
    return NextResponse.json({ error: 'Failed to load item' }, { status: 500 });
  }

  if (priceZAR <= 0) {
    return NextResponse.json(
      { error: 'This item is free — no payment required.' },
      { status: 400 }
    );
  }

  // ── Live FX rate ────────────────────────────────────────────────────────
  const fx        = await getZarToUsdRate();
  const amountUSD = zarToUsd(priceZAR, fx.zarToUsdRate);

  if (amountUSD < 0.01) {
    return NextResponse.json({ error: 'Amount too small for PayPal ($0.01 minimum)' }, { status: 400 });
  }

  // ── If caller only wants FX preview (no buyer details yet), return early ─
  // PayPalBuyButton hits this first to display the USD amount before asking
  // for buyer details. No Purchase row created at this stage.
  if (!buyerEmail || !buyerName) {
    return NextResponse.json({
      amountUSD,
      priceZAR,
      fxRate:   fx.zarToUsdRate,
      fxSource: fx.source,
      currency: 'USD',
    });
  }

  // ── Create pending Purchase row (mirrors Paystack initialize) ───────────
  const licenseId = `VK-${Date.now().toString(36).toUpperCase()}`;

  // Resolve userId from email if not provided
  const resolvedUserId = userId ?? (
    await prisma.user.findUnique({ where: { email: buyerEmail }, select: { id: true } })
      .catch(() => null)
  )?.id ?? null;

  const purchase = await prisma.purchase.create({
    data: {
      userId:      resolvedUserId,
      buyerEmail,
      buyerName,
      itemType,
      beatId:      itemType === 'beat'    ? itemId : null,
      releaseId:   itemType === 'release' ? itemId : null,
      videoId:     itemType === 'video'   ? itemId : null,
      sampleId:    itemType === 'sample'  ? itemId : null,
      artistId:    artistId || null,
      amount:      priceZAR,
      currency:    'ZAR',
      licenseType: itemType === 'beat' ? licenseType : 'standard',
      licenseId,
      status:      'pending',
    },
  });

  // ── Create PayPal order ─────────────────────────────────────────────────
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vukamusic.com';
  const idempotencyKey = `vuka-order-${purchase.id}`;

  let order;
  try {
    order = await paypal.orders.create(
      {
        amountUSD,
        items: [{
          name:        `${itemTitle} by ${artistName}`.slice(0, 127),
          description: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} — Vuka Music`,
          amountUSD,
        }],
        returnUrl:  `${appUrl}/checkout/paypal/return?purchaseId=${purchase.id}&itemType=${itemType}&itemId=${itemId}`,
        cancelUrl:  `${appUrl}/checkout/paypal/cancel`,
        reference:  idempotencyKey,
        buyerEmail,
      },
      idempotencyKey,
    );
  } catch (err) {
    // Clean up pending purchase so it doesn't pollute the DB
    await prisma.purchase.delete({ where: { id: purchase.id } }).catch(() => {});
    logger.error('[PayPal create-order] PayPal order creation failed', { err, traceId });
    return NextResponse.json(
      { error: 'Failed to create PayPal order. Please try again.' },
      { status: 500 }
    );
  }

  // Store PayPal orderId on the Purchase so capture-order can look it up
  await prisma.purchase.update({
    where: { id: purchase.id },
    data:  { paystackReference: `paypal:${order.id}` },
  });

  const approveUrl = getApproveUrl(order);

  if (!approveUrl) {
    await prisma.purchase.delete({ where: { id: purchase.id } }).catch(() => {});
    return NextResponse.json({ error: 'PayPal did not return an approval URL.' }, { status: 502 });
  }

  logger.info('[PayPal create-order] Order created', {
    traceId, purchaseId: purchase.id, orderId: order.id,
    amountUSD, priceZAR, fxRate: fx.zarToUsdRate, fxSource: fx.source, itemType, itemId,
  });

  return NextResponse.json({
    orderId:    order.id,
    purchaseId: purchase.id,
    approveUrl,
    amountUSD,
    priceZAR,
    fxRate:     fx.zarToUsdRate,
    fxSource:   fx.source,
    currency:   'USD',
  });
}
