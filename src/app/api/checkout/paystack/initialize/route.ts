/**
 * POST /api/checkout/paystack/initialize
 *
 * Replaces /api/checkout/payfast/create-session and /api/checkout/payfast/initiate.
 * Called by BuyModal for beats, releases, videos, samples, merch.
 * Returns { authorizationUrl, reference, method } for paid items.
 * Returns { url, method: 'free' } for free items.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { initializeTransaction, generateReference } from '@/lib/paystack';
import { logger } from '@/lib/logger';
import { sendPurchaseConfirmation } from '@/lib/emails';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? 'no-trace';

  try {
    const body = await req.json();
    const {
      itemType, itemId, licenseType,
      buyerEmail, buyerName, currency = 'ZAR',
      customAmount, userId, shippingAddress,
    } = body;

    if (!itemType || !itemId || !buyerEmail || !buyerName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let itemName    = '';
    let amount      = 0;
    let artistEmail = '';
    // Merch only — kept separate from `amount` so platform-fee calculations
    // (which run against `amount`/`purchase.amount` everywhere downstream)
    // never include shipping. Charged to the buyer on top of `amount`.
    let shippingFee = 0;

    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!beat || !beat.isActive) return NextResponse.json({ error: 'Beat not found or inactive' }, { status: 404 });
      if (beat.isExclusive)        return NextResponse.json({ error: 'Beat already sold exclusively' }, { status: 400 });
      const priceMap: Record<string, number> = { basic: beat.basicPrice, premium: beat.premiumPrice, exclusive: beat.exclPrice };
      amount      = priceMap[licenseType || 'basic'] ?? beat.basicPrice;
      itemName    = `${beat.title} (${licenseType || 'Basic'} License)`;
      artistEmail = beat.artist.user.email;

    } else if (itemType === 'release') {
      const storeRelease = await prisma.release.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      }).catch(() => null);

      if (!storeRelease?.isActive) return NextResponse.json({ error: 'Release not found or inactive' }, { status: 404 });
      amount = parseFloat(customAmount) || storeRelease.price;
      if (storeRelease.minPrice > 0 && amount < storeRelease.minPrice)
        return NextResponse.json({ error: `Minimum price is R${storeRelease.minPrice}` }, { status: 400 });
      itemName    = storeRelease.title;
      artistEmail = storeRelease.artist.user.email;

    } else if (itemType === 'video') {
      const video = await prisma.video.findUnique({ where: { id: itemId }, include: { artist: { include: { user: true } } } });
      if (!video?.isActive) return NextResponse.json({ error: 'Video not found or inactive' }, { status: 404 });
      amount = video.price; itemName = video.title; artistEmail = video.artist.user.email;

    } else if (itemType === 'sample') {
      const sample = await prisma.sample.findUnique({ where: { id: itemId }, include: { artist: { include: { user: true } } } });
      if (!sample?.isActive) return NextResponse.json({ error: 'Sample not found or inactive' }, { status: 404 });
      amount = sample.price; itemName = sample.title; artistEmail = sample.artist.user.email;

    } else if (itemType === 'merch') {
      const item = await prisma.merch.findUnique({ where: { id: itemId }, include: { artist: { include: { user: true } } } });
      if (!item?.isActive) return NextResponse.json({ error: 'Merch not found or unavailable' }, { status: 404 });
      if (item.stock <= 0)  return NextResponse.json({ error: 'Out of stock' }, { status: 400 });
      amount = item.price; itemName = item.title; artistEmail = item.artist.user.email;
      shippingFee = item.shippingFee || 0;

      // Physical goods — a shipping address is mandatory, not optional,
      // regardless of whether shippingFee is 0. There is no way to fulfil
      // an order with nowhere to send it.
      const addr = shippingAddress || {};
      const requiredAddrFields = ['name', 'line1', 'city', 'province', 'postalCode', 'phone'];
      const missing = requiredAddrFields.filter(f => !addr[f]);
      if (missing.length > 0) {
        return NextResponse.json({ error: `Shipping address incomplete — missing: ${missing.join(', ')}` }, { status: 400 });
      }

    } else {
      return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
    }

    const licenseId = `VK-${Date.now().toString(36).toUpperCase()}`;
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // ── FREE item ───────────────────────────────────────────────────────────
    if (amount === 0) {
      const purchase  = await prisma.purchase.create({
        data: {
          userId:                userId || null,
          buyerEmail, buyerName, itemType,
          beatId:                itemType === 'beat'    ? itemId : null,
          releaseId:             itemType === 'release' ? itemId : null,
          videoId:               itemType === 'video'   ? itemId : null,
          sampleId:              itemType === 'sample'  ? itemId : null,
          merchId:               itemType === 'merch'   ? itemId : null,
          amount: 0, currency, licenseType: licenseType || '', licenseId,
          status: 'confirmed', platformFee: 0, netAmount: 0,
        },
      });
      try {
        await sendPurchaseConfirmation({
          to: buyerEmail, buyerName, itemName: itemName || 'your item',
          itemType, licenseType: licenseType || undefined,
          downloadUrl: `${appUrl}/download/${purchase.downloadToken}`,
          amount: 0, currency, licenseId,
        });
      } catch (e) {
        logger.error('[paystack/initialize] Free email failed', { traceId, error: String(e) });
      }
      return NextResponse.json({ url: `${appUrl}/checkout/success?purchaseId=${purchase.id}`, method: 'free' });
    }

    // ── PAID item ───────────────────────────────────────────────────────────
    const purchase = await prisma.purchase.create({
      data: {
        userId:                userId || null,
        buyerEmail, buyerName, itemType,
        beatId:                itemType === 'beat'    ? itemId : null,
        releaseId:             itemType === 'release' ? itemId : null,
        videoId:               itemType === 'video'   ? itemId : null,
        sampleId:              itemType === 'sample'  ? itemId : null,
        merchId:               itemType === 'merch'   ? itemId : null,
        amount, currency, licenseType: licenseType || '', licenseId,
        status: 'pending',
      },
    });

    const reference = generateReference('VKB');

    const result = await initializeTransaction({
      email:       buyerEmail,
      amountZAR:   amount,
      reference,
      callbackUrl: `${appUrl}/checkout/success?purchaseId=${purchase.id}`,
      metadata: {
        purchaseId: purchase.id,
        itemType,
        itemId,
        licenseType: licenseType || '',
        licenseId,
        artistEmail,
        buyerName,
      },
    });

    // Store reference on purchase so webhook can look it up
    await prisma.purchase.update({
      where: { id: purchase.id },
      data:  { paystackReference: reference }, // reusing column — holds Paystack reference
    });

    logger.info('[paystack/initialize] Transaction initialized', {
      traceId, purchaseId: purchase.id, amount, itemType, reference,
    });

    return NextResponse.json({
      authorizationUrl: result.authorizationUrl,
      reference:        result.reference,
      purchaseId:       purchase.id,
      method:           'paystack',
    });

  } catch (err) {
    logger.error('[paystack/initialize] Error', { traceId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
