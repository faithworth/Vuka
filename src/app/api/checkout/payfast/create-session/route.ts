/**
 * POST /api/checkout/payfast/create-session
 *
 * Phase 12 — Unified checkout via PayFast only (Stripe removed).
 * Replaces /api/checkout/stripe/create-session.
 *
 * Handles: beats, releases (paid + free/name-your-price).
 * Returns { formData, actionUrl, method: 'payfast' } for paid items.
 * Returns { url, method: 'free' } for free items (no payment gateway).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildPayFastForm } from '@/lib/payfast';
import { logger } from '@/lib/logger';
import { sendPurchaseConfirmation } from '@/lib/emails';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? 'no-trace';

  try {
    const body = await req.json();
    const {
      itemType, itemId, licenseType,
      buyerEmail, buyerName, currency = 'ZAR',
      customAmount,
      userId,  // optional — set when buyer is logged in, links purchase to their account
    } = body;

    if (!itemType || !itemId || !buyerEmail || !buyerName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let itemName = '';
    let amount = 0; // in ZAR (not cents)
    let artistEmail = '';

    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!beat || !beat.isActive) {
        return NextResponse.json({ error: 'Beat not found or inactive' }, { status: 404 });
      }
      if (beat.isExclusive) {
        return NextResponse.json({ error: 'Beat is already sold exclusively' }, { status: 400 });
      }

      const priceMap: Record<string, number> = {
        basic:     beat.basicPrice,
        premium:   beat.premiumPrice,
        exclusive: beat.exclPrice,
      };
      amount      = priceMap[licenseType || 'basic'] ?? beat.basicPrice;
      itemName    = `${beat.title} (${licenseType || 'Basic'} License)`;
      artistEmail = beat.artist.user.email;

    } else if (itemType === 'release') {
      // Try store Release first
      let storeRelease = await prisma.release.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      }).catch(() => null);

      if (storeRelease && storeRelease.isActive) {
        amount = parseFloat(customAmount) || storeRelease.price;
        if (storeRelease.minPrice > 0 && amount < storeRelease.minPrice) {
          return NextResponse.json(
            { error: `Minimum price is R${storeRelease.minPrice}` },
            { status: 400 }
          );
        }
        itemName    = storeRelease.title;
        artistEmail = storeRelease.artist.user.email;
      } else {
        // Fall back to DistributionRelease
        const distRelease = await prisma.distributionRelease.findUnique({
          where: { id: itemId },
          include: { artist: { include: { user: true } } },
        }).catch(() => null);

        if (!distRelease || distRelease.status !== 'live') {
          return NextResponse.json({ error: 'Release not found or not available' }, { status: 404 });
        }

        const releasePrice    = (distRelease as any).price ?? 0;
        const releaseMinPrice = (distRelease as any).minPrice ?? 0;
        const payWYW          = (distRelease as any).payWhatYouWant ?? false;

        if (payWYW) {
          // Fan chose their own amount — enforce minimum
          amount = parseFloat(customAmount) || releaseMinPrice;
          if (releaseMinPrice > 0 && amount < releaseMinPrice) {
            return NextResponse.json(
              { error: `Minimum price is R${releaseMinPrice}` },
              { status: 400 }
            );
          }
        } else {
          amount = releasePrice;
        }

        itemName    = distRelease.title;
        artistEmail = distRelease.artist.user.email;
      }

    } else if (itemType === 'video') {
      const video = await prisma.video.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!video || !video.isActive) {
        return NextResponse.json({ error: 'Video not found or inactive' }, { status: 404 });
      }
      amount      = video.price;
      itemName    = video.title;
      artistEmail = video.artist.user.email;

    } else if (itemType === 'sample') {
      const sample = await prisma.sample.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!sample || !sample.isActive) {
        return NextResponse.json({ error: 'Sample not found or inactive' }, { status: 404 });
      }
      amount      = sample.price;
      itemName    = sample.title;
      artistEmail = sample.artist.user.email;

    } else if (itemType === 'merch') {
      const item = await prisma.merch.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!item || !item.isActive) {
        return NextResponse.json({ error: 'Merch item not found or unavailable' }, { status: 404 });
      }
      if (item.stock <= 0) {
        return NextResponse.json({ error: 'Out of stock' }, { status: 400 });
      }
      amount      = item.price;
      itemName    = item.title;
      artistEmail = item.artist.user.email;

    } else {
      return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
    }

    const licenseId = `VK-${Date.now().toString(36).toUpperCase()}`;
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // ── FREE item — skip gateway entirely ───────────────────────
    if (amount === 0) {
      const isDistrib = itemType === 'release' && !(await prisma.release.findUnique({ where: { id: itemId } }).catch(() => null));
      const purchase = await prisma.purchase.create({
        data: {
          userId:                  userId || null,
          buyerEmail,
          buyerName,
          itemType,
          beatId:                  itemType === 'beat' ? itemId : null,
          releaseId:               itemType === 'release' && !isDistrib ? itemId : null,
          distributionReleaseId:   itemType === 'release' && isDistrib ? itemId : null,
          videoId:                 itemType === 'video' ? itemId : null,
          sampleId:                itemType === 'sample' ? itemId : null,
          merchId:                 itemType === 'merch' ? itemId : null,
          amount:                  0,
          currency,
          licenseType:             licenseType || '',
          licenseId,
          status:                  'confirmed',
          platformFee:             0,
          netAmount:               0,
        },
      });
      const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;
      try {
        await sendPurchaseConfirmation({
          to:          buyerEmail,
          buyerName,
          itemName:    itemName || 'your item',
          itemType,
          licenseType: licenseType || undefined,
          downloadUrl,
          amount:      0,
          currency,
          licenseId,
        });
      } catch (emailErr) {
        logger.error('[create-session] Free item email failed', {
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        });
      }
      return NextResponse.json({
        url: `${appUrl}/checkout/success?purchaseId=${purchase.id}`,
        method: 'free',
      });
    }

    // ── PAID item — create pending purchase then build PayFast form ──
    const isDistribPaid = itemType === 'release' && !(await prisma.release.findUnique({ where: { id: itemId } }).catch(() => null));
    const purchase = await prisma.purchase.create({
      data: {
        userId:                userId || null,
        buyerEmail,
        buyerName,
        itemType,
        beatId:                itemType === 'beat' ? itemId : null,
        releaseId:             itemType === 'release' && !isDistribPaid ? itemId : null,
        distributionReleaseId: itemType === 'release' && isDistribPaid  ? itemId : null,
        videoId:               itemType === 'video' ? itemId : null,
        sampleId:              itemType === 'sample' ? itemId : null,
        merchId:               itemType === 'merch' ? itemId : null,
        amount,
        currency,
        licenseType:           licenseType || '',
        licenseId,
        status:                'pending',
      },
    });

    const isSandbox   = process.env.PAYFAST_SANDBOX === 'true';
    const merchantId  = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10000100')
      : process.env.PAYFAST_MERCHANT_ID!;
    const merchantKey = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '46f0cd694581a')
      : process.env.PAYFAST_MERCHANT_KEY!;
    const passphrase  = isSandbox
      ? (process.env.PAYFAST_SANDBOX_PASSPHRASE || '')
      : (process.env.PAYFAST_PASSPHRASE || '');

    if (!merchantId || !merchantKey) {
      logger.error('[payfast/create-session] No PayFast credentials configured', { traceId });
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 });
    }

    const formData = buildPayFastForm(
      {
        merchant_id:   merchantId,
        merchant_key:  merchantKey,
        return_url:    `${appUrl}/checkout/success?purchaseId=${purchase.id}`,
        cancel_url:    `${appUrl}/${itemType}/${itemId}`,
        notify_url:    `${appUrl}/api/checkout/payfast/notify`,
        name_first:    buyerName.split(' ')[0] || buyerName,
        name_last:     buyerName.split(' ').slice(1).join(' ') || '',
        email_address: buyerEmail,
        m_payment_id:  purchase.id,
        amount:        Number(amount).toFixed(2),
        item_name:     itemName.substring(0, 100),
        custom_str1:   itemType,
        custom_str2:   itemId,
        custom_str3:   licenseType || '',
        custom_str4:   licenseId,
        custom_str5:   artistEmail,
      },
      passphrase
    );

    logger.info('[payfast/create-session] PayFast form built', {
      traceId, purchaseId: purchase.id, amount, itemType,
    });

    return NextResponse.json({
      formData,
      actionUrl: isSandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process',
      method: 'payfast',
    });

  } catch (err) {
    logger.error('[payfast/create-session] Unexpected error', {
      traceId, error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
