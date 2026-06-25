/**
 * POST /api/checkout/paypal/create-order
 *
 * Creates a PayPal order for international buyers purchasing beats, releases,
 * videos, or samples. Returns the PayPal order ID and approve URL.
 *
 * Body:
 *   itemType    — 'beat' | 'release' | 'video' | 'sample'
 *   itemId      — cuid of the item
 *   buyerEmail? — pre-fill PayPal login
 *
 * The client redirects the buyer to approveUrl, then calls /capture-order
 * once PayPal redirects back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import paypal, { isPayPalConfigured, getApproveUrl, zarToUsd } from '@/lib/paypal';
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
  const ip      = getClientIp(req);

  // ── PayPal availability guard ──────────────────────────────────────────
  if (!isPayPalConfigured()) {
    return NextResponse.json(
      { error: 'PayPal payments are not available at this time.' },
      { status: 503 }
    );
  }

  // ── Rate limit ─────────────────────────────────────────────────────────
  const limited = await rateLimit(ip, RATE_LIMITS.checkout_init, ip);
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429 }
    );
  }

  // ── Parse & validate body ──────────────────────────────────────────────
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
  let itemTitle   = '';
  let priceZAR    = 0;
  let artistName  = '';

  try {
    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: itemId, isPublished: true },
        select: { title: true, price: true, artist: { select: { name: true } } },
      });
      if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      itemTitle  = beat.title;
      priceZAR   = beat.price;
      artistName = beat.artist?.name ?? '';

    } else if (itemType === 'release') {
      const release = await prisma.release.findUnique({
        where: { id: itemId },
        select: { title: true, price: true, artist: { select: { name: true } } },
      });
      if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      itemTitle  = release.title;
      priceZAR   = release.price ?? 0;
      artistName = release.artist?.name ?? '';

    } else if (itemType === 'video') {
      const video = await prisma.video.findUnique({
        where: { id: itemId },
        select: { title: true, price: true, artist: { select: { name: true } } },
      });
      if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      itemTitle  = video.title;
      priceZAR   = video.price ?? 0;
      artistName = video.artist?.name ?? '';

    } else if (itemType === 'sample') {
      const sample = await prisma.sample.findUnique({
        where: { id: itemId },
        select: { title: true, price: true, artist: { select: { name: true } } },
      });
      if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
      itemTitle  = sample.title;
      priceZAR   = sample.price ?? 0;
      artistName = sample.artist?.name ?? '';
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

  // ── Convert ZAR → USD ─────────────────────────────────────────────────
  const amountUSD = zarToUsd(priceZAR);
  if (amountUSD < 0.01) {
    return NextResponse.json({ error: 'Amount too small for PayPal' }, { status: 400 });
  }

  // ── Build idempotency key ──────────────────────────────────────────────
  const idempotencyKey = `vuka-order-${itemType}-${itemId}-${Date.now()}`;

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vuka.co.za';
  const returnUrl  = `${appUrl}/checkout/paypal/return?itemType=${itemType}&itemId=${itemId}`;
  const cancelUrl  = `${appUrl}/checkout/paypal/cancel`;

  // ── Create PayPal order ────────────────────────────────────────────────
  try {
    const order = await paypal.orders.create(
      {
        amountUSD,
        items: [{
          name:        `${itemTitle} by ${artistName}`.slice(0, 127),
          description: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} — Vuka Music`,
          amountUSD,
        }],
        returnUrl,
        cancelUrl,
        reference:  idempotencyKey,
        buyerEmail,
      },
      idempotencyKey,
    );

    const approveUrl = getApproveUrl(order);

    logger.info('[PayPal] Order created', {
      orderId:  order.id,
      amountUSD,
      priceZAR,
      itemType,
      itemId,
      traceId,
    });

    return NextResponse.json({
      orderId:    order.id,
      approveUrl,
      amountUSD,
      priceZAR,
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
