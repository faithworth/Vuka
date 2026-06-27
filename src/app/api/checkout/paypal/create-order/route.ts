/**
 * POST /api/checkout/paypal/create-order
 *
 * Creates a PayPal order for international buyers.
 * Uses live ZAR→USD FX rate from @/lib/fx (open.er-api.com with fallback).
 * Stores the rate used on the response so the client can display it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import paypal, { isPayPalConfigured, getApproveUrl } from '@/lib/paypal';
import { getZarToUsdRate, zarToUsd } from '@/lib/fx';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const schema = z.object({
  itemType:   z.enum(['beat', 'release', 'video', 'sample']),
  itemId:     z.string().min(1),
  buyerEmail: z.string().email().optional(),
});

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

  const { itemType, itemId, buyerEmail } = parsed.data;

  // ── Resolve item & price ───────────────────────────────────────────────
  let itemTitle  = '';
  let priceZAR   = 0;
  let artistName = '';

  try {
    const select = { title: true, price: true, artist: { select: { name: true } } };

    if (itemType === 'beat') {
      const r = await prisma.beat.findUnique({ where: { id: itemId, isPublished: true }, select });
      if (!r) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      itemTitle = r.title; priceZAR = r.price; artistName = r.artist?.name ?? '';
    } else if (itemType === 'release') {
      const r = await prisma.release.findUnique({ where: { id: itemId }, select });
      if (!r) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      itemTitle = r.title; priceZAR = r.price ?? 0; artistName = r.artist?.name ?? '';
    } else if (itemType === 'video') {
      const r = await prisma.video.findUnique({ where: { id: itemId }, select });
      if (!r) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      itemTitle = r.title; priceZAR = r.price ?? 0; artistName = r.artist?.name ?? '';
    } else if (itemType === 'sample') {
      const r = await prisma.sample.findUnique({ where: { id: itemId }, select });
      if (!r) return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
      itemTitle = r.title; priceZAR = r.price ?? 0; artistName = r.artist?.name ?? '';
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

  // ── Live FX rate ───────────────────────────────────────────────────────
  const fx          = await getZarToUsdRate();
  const amountUSD   = zarToUsd(priceZAR, fx.zarToUsdRate);

  if (amountUSD < 0.01) {
    return NextResponse.json({ error: 'Amount too small for PayPal ($0.01 minimum)' }, { status: 400 });
  }

  const idempotencyKey = `vuka-order-${itemType}-${itemId}-${Date.now()}`;
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vuka.co.za';

  try {
    const order = await paypal.orders.create(
      {
        amountUSD,
        items: [{
          name:        `${itemTitle} by ${artistName}`.slice(0, 127),
          description: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} — Vuka Music`,
          amountUSD,
        }],
        returnUrl:  `${appUrl}/checkout/paypal/return?itemType=${itemType}&itemId=${itemId}`,
        cancelUrl:  `${appUrl}/checkout/paypal/cancel`,
        reference:  idempotencyKey,
        buyerEmail,
      },
      idempotencyKey,
    );

    const approveUrl = getApproveUrl(order);

    logger.info('[PayPal] Order created', {
      orderId: order.id, amountUSD, priceZAR, fxRate: fx.zarToUsdRate,
      fxSource: fx.source, itemType, itemId, traceId,
    });

    return NextResponse.json({
      orderId:    order.id,
      approveUrl,
      amountUSD,
      priceZAR,
      fxRate:     fx.zarToUsdRate,
      fxSource:   fx.source,
      currency:   'USD',
    });

  } catch (err) {
    logger.error('[PayPal] create-order failed', { err, traceId, itemId, itemType });
    return NextResponse.json(
      { error: 'Failed to create PayPal order. Please try again.' },
      { status: 500 }
    );
  }
}
