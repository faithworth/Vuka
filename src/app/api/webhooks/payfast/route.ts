// src/app/api/webhooks/payfast/route.ts
// Handles ONLY IndustryServiceOrder payments (m_payment_id prefix: iso_<orderId>).
// All other PayFast ITNs are handled by /api/checkout/payfast/notify.
// payfast.service.ts notify_url now correctly points to /api/checkout/payfast/notify.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPayFastITN, type PayFastITNPayload } from '@/lib/services/payfast.service';
import { platformFee as calcFee, artistNet as calcNet } from '@/lib/plans';

const INDUSTRY_PLATFORM_FEE_PCT = 0.10; // 10 % charged to industry buyers (fixed — not plan-based)

async function processIndustryServiceOrder(orderId: string, payfastPaymentId: string, amountGross: number) {
  const order = await prisma.$queryRawUnsafe<any[]>(
    `SELECT iso.*,
            iu."userId" AS "industryUserId_user",
            a."userId"  AS "artistUserId",
            s.title     AS "serviceTitle"
       FROM "IndustryServiceOrder" iso
       JOIN "IndustryService"  s  ON s.id  = iso."serviceId"
       JOIN "IndustryUser"     iu ON iu.id = iso."industryUserId"
       JOIN "Artist"           a  ON a.id  = iso."artistId"
      WHERE iso.id = $1 AND iso.status = 'pending'`,
    orderId,
  );

  if (!order.length) {
    console.warn('[webhooks/payfast] IndustryServiceOrder not found or already processed:', orderId);
    return;
  }
  const o = order[0];

  const platformFee = Math.round(amountGross * INDUSTRY_PLATFORM_FEE_PCT * 100) / 100;
  const netAmount   = Math.round((amountGross - platformFee) * 100) / 100;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "IndustryServiceOrder"
          SET status = 'paid', "platformFee" = $1, "netAmount" = $2, "payfastPaymentId" = $3, "updatedAt" = now()
        WHERE id = $4`,
      platformFee, netAmount, payfastPaymentId, orderId,
    );

    await tx.artistPayout.create({
      data: {
        artistId: o.artistId,
        amount:   netAmount,
        method:   'platform',
        status:   'pending',
        notes:    `Industry service: ${o.serviceTitle} | industry_user:${o.industryUserId} | order:${orderId}`,
      } as any,
    });
  });

  console.log(`[webhooks/payfast] Industry order ${orderId} paid. Gross: ${amountGross} Fee: ${platformFee} Net: ${netAmount}`);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const params  = new URLSearchParams(rawBody);
    const payload = Object.fromEntries(params.entries()) as PayFastITNPayload;

    const verification = await verifyPayFastITN(payload, rawBody);
    if (!verification.valid) {
      console.error('[webhooks/payfast] Verification failed:', verification.reason);
      return new NextResponse('Invalid ITN', { status: 400 });
    }

    const { m_payment_id: paymentId, pf_payment_id: payfastPaymentId, amount_gross } = payload;
    const amountGross = parseFloat(amount_gross ?? '0');

    // Only handle industry service orders — all other payments go to /api/checkout/payfast/notify
    if (!paymentId?.startsWith('iso_')) {
      console.warn('[webhooks/payfast] Received non-ISO payment — should go to /api/checkout/payfast/notify:', paymentId);
      return new NextResponse('OK', { status: 200 }); // return 200 to stop PayFast retrying
    }

    const orderId = paymentId.replace('iso_', '');

    if (payload.payment_status === 'COMPLETE') {
      await processIndustryServiceOrder(orderId, payfastPaymentId, amountGross);
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "IndustryServiceOrder" SET status = 'failed', "updatedAt" = now() WHERE id = $1`,
        orderId,
      );
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('[webhooks/payfast] Error:', err);
    return new NextResponse('OK', { status: 200 }); // always 200 to PayFast
  }
}
