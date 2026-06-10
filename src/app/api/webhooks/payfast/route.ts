// src/app/api/webhooks/payfast/route.ts
// PayFast ITN (Instant Transaction Notification) webhook handler.
// PayFast POSTs to this URL when a payment completes or fails.
// This is the SOURCE OF TRUTH for payment confirmation — never trust the frontend.
//
// Payment routing by m_payment_id prefix:
//   iso_<orderId>  → IndustryServiceOrder (10% fee charged to industry)
//   everything else → Purchase (beat / release / generic)

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPayFastITN, type PayFastITNPayload } from '@/lib/services/payfast.service';
import { processBeatPurchase, processReleasePurchase } from '@/lib/services/transaction.service';

const INDUSTRY_PLATFORM_FEE_PCT = 0.10; // 10% charged to industry

async function processIndustryServiceOrder(orderId: string, payfastPaymentId: string, amountGross: number) {
  // Find the pending order
  const order = await prisma.$queryRawUnsafe<any[]>(
    `SELECT iso.*, 
            iu."userId" AS "industryUserId_user",
            a."userId" AS "artistUserId",
            s.title AS "serviceTitle"
       FROM "IndustryServiceOrder" iso
       JOIN "IndustryService" s ON s.id = iso."serviceId"
       JOIN "IndustryUser" iu ON iu.id = iso."industryUserId"
       JOIN "Artist" a ON a.id = iso."artistId"
      WHERE iso.id = $1 AND iso.status = 'pending'`,
    orderId,
  );

  if (!order.length) {
    console.warn('[payfast/ITN] IndustryServiceOrder not found or already processed:', orderId);
    return;
  }
  const o = order[0];

  const platformFee = Math.round(amountGross * INDUSTRY_PLATFORM_FEE_PCT * 100) / 100;
  const netAmount   = Math.round((amountGross - platformFee) * 100) / 100;

  // Atomic: mark order paid + record industry payout
  await prisma.$transaction(async (tx) => {
    // 1. Update order to paid
    await tx.$executeRawUnsafe(
      `UPDATE "IndustryServiceOrder"
          SET status = 'paid', "platformFee" = $1, "netAmount" = $2, "payfastPaymentId" = $3, "updatedAt" = now()
        WHERE id = $4`,
      platformFee, netAmount, payfastPaymentId, orderId,
    );

    // 2. Create ArtistPayout for the industry professional (pending — admin pays out)
    // Note: industryOrderId column added in migration
    await tx.artistPayout.create({
      data: {
        // artistId maps to the industry user's artist record if they have one,
        // but industry users are not artists. We store payout by using a special
        // notes field and attach to the industryOrderId column.
        // Instead, we record a RevenueRecord for the platform fee.
        artistId: o.artistId, // placeholder - we'll use notes to identify industry payment
        amount:   netAmount,
        method:   'platform',
        status:   'pending',
        notes:    `Industry service payment: ${o.serviceTitle} | industry_user:${o.industryUserId} | order:${orderId}`,
      } as any,
    });

    // 3. Record platform's fee in RevenueRecord (optional — for accounting)
    // Using artistId of buyer's artist record is a workaround; 
    // In production this should be a platform revenue table
  });

  console.log(`[payfast/ITN] Industry order ${orderId} paid. Amount: ${amountGross}, Fee: ${platformFee}, Net: ${netAmount}`);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const params  = new URLSearchParams(rawBody);

    // Parse ITN payload
    const payload: PayFastITNPayload = Object.fromEntries(params.entries()) as PayFastITNPayload;

    // Verify the notification is legitimate
    const verification = await verifyPayFastITN(payload, rawBody);
    if (!verification.valid) {
      console.error('[payfast/ITN] Verification failed:', verification.reason, payload);
      return new NextResponse('Invalid ITN', { status: 400 });
    }

    const purchaseId       = payload.m_payment_id;
    const payfastPaymentId = payload.pf_payment_id;
    const amountGross      = parseFloat(payload.amount_gross ?? '0');

    // ── ROUTE: Industry Service Order ─────────────────────────
    if (purchaseId.startsWith('iso_')) {
      const orderId = purchaseId.replace('iso_', '');
      if (payload.payment_status === 'COMPLETE') {
        await processIndustryServiceOrder(orderId, payfastPaymentId, amountGross);
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE "IndustryServiceOrder" SET status = 'failed', "updatedAt" = now() WHERE id = $1`,
          orderId,
        );
      }
      return new NextResponse('OK', { status: 200 });
    }

    // ── ROUTE: Standard Purchase (beat / release) ──────────────
    const pendingPurchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, status: 'pending' },
      include: {
        beat:    { include: { artist: { include: { user: true } } } },
        release: { include: { artist: { include: { user: true } } } },
        user:    true,
      },
    });

    if (!pendingPurchase) {
      console.warn('[payfast/ITN] Purchase not found or already processed:', purchaseId);
      return new NextResponse('OK', { status: 200 });
    }

    if (payload.payment_status === 'COMPLETE') {
      const buyerEmail = pendingPurchase.buyerEmail;
      const buyerName  = pendingPurchase.buyerName;

      if (pendingPurchase.beat) {
        await processBeatPurchase({
          buyerUserId:     pendingPurchase.userId,
          buyerEmail,
          buyerName,
          artistId:        pendingPurchase.beat.artistId,
          artistUserId:    pendingPurchase.beat.artist.userId,
          beatId:          pendingPurchase.beatId!,
          beatTitle:       pendingPurchase.beat.title,
          amount:          amountGross,
          payfastPaymentId,
          downloadToken:   pendingPurchase.downloadToken ?? undefined,
        });
      } else if (pendingPurchase.release) {
        await processReleasePurchase({
          buyerUserId:     pendingPurchase.userId,
          buyerEmail,
          buyerName,
          artistId:        pendingPurchase.release.artistId,
          artistUserId:    pendingPurchase.release.artist.userId,
          releaseId:       pendingPurchase.releaseId!,
          releaseTitle:    pendingPurchase.release.title,
          amount:          amountGross,
          payfastPaymentId,
          downloadToken:   pendingPurchase.downloadToken ?? undefined,
        });
      } else {
        await prisma.purchase.update({
          where: { id: purchaseId },
          data:  { status: 'confirmed', payfastPfPaymentId: payfastPaymentId },
        });
      }
    } else {
      await prisma.purchase.update({
        where: { id: purchaseId },
        data:  { status: 'failed' },
      });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('[payfast/ITN] Error:', err);
    return new NextResponse('OK', { status: 200 });
  }
}
