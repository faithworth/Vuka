/**
 * POST /api/checkout/yoco/initialize
 *
 * Yoco equivalent of /api/checkout/paystack/initialize — same item lookup
 * and Purchase-creation logic, Yoco Checkout instead of a Paystack
 * transaction. Called by BuyModal for beats, releases, videos, samples,
 * merch. Returns { redirectUrl, reference, method } for paid items, or
 * { url, method: 'free' } for free items.
 *
 * NOTE: This covers the direct-purchase flow only. Plans, marketplace
 * orders, memberships, industry orders, tips, tickets, and campaign
 * pledges still go through Paystack — see PHASE2 follow-up.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createYocoCheckout, generateReference } from '@/lib/yoco';
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
    let shippingFee = 0;

    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!beat || !beat.isActive) return NextResponse.json({ error: 'Beat not found or inactive' }, { status: 404 });
      if (beat.isExclusive)        return NextResponse.json({ error: 'Beat already sold exclusively' }, { status: 400 });
      const priceMap: Record<string, number> = { basic: beat.basicPrice, premium: beat.premiumPrice, exclusive: beat.exclPrice };
      amount   = priceMap[licenseType || 'basic'] ?? beat.basicPrice;
      itemName = `${beat.title} (${licenseType || 'Basic'} License)`;

    } else if (itemType === 'release') {
      const storeRelease = await prisma.release.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      }).catch(() => null);

      if (!storeRelease?.isActive) return NextResponse.json({ error: 'Release not found or inactive' }, { status: 404 });
      amount = parseFloat(customAmount) || storeRelease.price;
      if (storeRelease.minPrice > 0 && amount < storeRelease.minPrice)
        return NextResponse.json({ error: `Minimum price is R${storeRelease.minPrice}` }, { status: 400 });
      itemName = storeRelease.title;

    } else if (itemType === 'video') {
      const video = await prisma.video.findUnique({ where: { id: itemId }, include: { artist: { include: { user: true } } } });
      if (!video?.isActive) return NextResponse.json({ error: 'Video not found or inactive' }, { status: 404 });
      amount = video.price; itemName = video.title;

    } else if (itemType === 'sample') {
      const sample = await prisma.sample.findUnique({ where: { id: itemId }, include: { artist: { include: { user: true } } } });
      if (!sample?.isActive) return NextResponse.json({ error: 'Sample not found or inactive' }, { status: 404 });
      amount = sample.price; itemName = sample.title;

    } else if (itemType === 'merch') {
      const item = await prisma.merch.findUnique({ where: { id: itemId }, include: { artist: { include: { user: true } } } });
      if (!item?.isActive) return NextResponse.json({ error: 'Merch not found or unavailable' }, { status: 404 });
      if (item.stock <= 0)  return NextResponse.json({ error: 'Out of stock' }, { status: 400 });
      const addr = shippingAddress || {};
      const missing = ['name', 'line1', 'city', 'postalCode', 'phone'].filter(k => !String(addr[k] || '').trim());
      if (missing.length) {
        return NextResponse.json({ error: `Missing shipping details: ${missing.join(', ')}` }, { status: 400 });
      }
      shippingFee = item.shippingFee || 0;
      amount = item.price + shippingFee; itemName = item.title;

    } else {
      return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
    }

    const licenseId = `VK-${Date.now().toString(36).toUpperCase()}`;
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // ── FREE item ───────────────────────────────────────────────────────────
    if (amount === 0) {
      const purchase = await prisma.purchase.create({
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
          ...(itemType === 'merch' ? { shippingFee: 0, shippingAddress, fulfillmentStatus: 'awaiting_shipment' } : {}),
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
        logger.error('[yoco/initialize] Free email failed', { traceId, error: String(e) });
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
        ...(itemType === 'merch' ? { shippingFee, shippingAddress } : {}),
      },
    });

    const reference = generateReference('VKY'); // VKY = Vuka/Yoco, distinct from Paystack's VKB prefix

    const checkout = await createYocoCheckout({
      amountZAR:  amount,
      currency,
      reference,
      successUrl: `${appUrl}/checkout/success?purchaseId=${purchase.id}`,
      cancelUrl:  `${appUrl}/checkout/cancelled?purchaseId=${purchase.id}`,
      failureUrl: `${appUrl}/checkout/failed?purchaseId=${purchase.id}`,
      metadata: { purchaseId: purchase.id, itemType, itemId, licenseType: licenseType || '', licenseId, buyerName },
    });

    // Reusing the paystackReference column as a generic gateway-reference
    // lookup field — see src/lib/purchase-confirmation.ts.
    await prisma.purchase.update({
      where: { id: purchase.id },
      data:  { paystackReference: reference },
    });

    logger.info('[yoco/initialize] Checkout created', { traceId, purchaseId: purchase.id, amount, itemType, reference, checkoutId: checkout.checkoutId });

    return NextResponse.json({
      redirectUrl: checkout.redirectUrl,
      reference,
      purchaseId:  purchase.id,
      method:      'yoco',
    });

  } catch (err) {
    logger.error('[yoco/initialize] Error', { traceId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
