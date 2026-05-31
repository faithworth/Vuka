// src/app/api/webhooks/payfast/route.ts
// PayFast ITN (Instant Transaction Notification) webhook handler.
// PayFast POSTs to this URL when a payment completes or fails.
// This is the SOURCE OF TRUTH for payment confirmation — never trust the frontend.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPayFastITN, type PayFastITNPayload } from '@/lib/services/payfast.service';
import { processBeatPurchase, processReleasePurchase } from '@/lib/services/transaction.service';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);

    // Parse ITN payload
    const payload: PayFastITNPayload = Object.fromEntries(params.entries()) as PayFastITNPayload;

    // Verify the notification is legitimate
    const verification = await verifyPayFastITN(payload, rawBody);
    if (!verification.valid) {
      console.error('[payfast/ITN] Verification failed:', verification.reason, payload);
      return new NextResponse('Invalid ITN', { status: 400 });
    }

    const purchaseId = payload.m_payment_id;
    const payfastPaymentId = payload.pf_payment_id;
    const amountGross = parseFloat(payload.amount_gross ?? '0');

    // Find the pending purchase in our DB by our internal ID
    const pendingPurchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, status: 'pending' },
      include: {
        beat: {
          include: {
            artist: { include: { user: true } },
          },
        },
        release: {
          include: {
            artist: { include: { user: true } },
          },
        },
        user: true,
      },
    });

    if (!pendingPurchase) {
      // Already processed or doesn't exist — return 200 to stop PayFast retrying
      console.warn('[payfast/ITN] Purchase not found or already processed:', purchaseId);
      return new NextResponse('OK', { status: 200 });
    }

    if (payload.payment_status === 'COMPLETE') {
      if (pendingPurchase.beat) {
        await processBeatPurchase({
          buyerUserId: pendingPurchase.userId,
          buyerName: pendingPurchase.user.name ?? 'Fan',
          artistId: pendingPurchase.beat.artistId,
          artistUserId: pendingPurchase.beat.artist.userId,
          beatId: pendingPurchase.beatId!,
          beatTitle: pendingPurchase.beat.title,
          amount: amountGross,
          paymentRef: payfastPaymentId,
          downloadToken: pendingPurchase.downloadToken ?? undefined,
        });
      } else if (pendingPurchase.release) {
        await processReleasePurchase({
          buyerUserId: pendingPurchase.userId,
          buyerName: pendingPurchase.user.name ?? 'Fan',
          artistId: pendingPurchase.release.artistId,
          artistUserId: pendingPurchase.release.artist.userId,
          releaseId: pendingPurchase.releaseId!,
          releaseTitle: pendingPurchase.release.title,
          amount: amountGross,
          paymentRef: payfastPaymentId,
          downloadToken: pendingPurchase.downloadToken ?? undefined,
        });
      } else {
        // Mark as completed directly if no beat/release link
        await prisma.purchase.update({
          where: { id: purchaseId },
          data: { status: 'completed', paymentRef: payfastPaymentId },
        });
      }
    } else {
      // FAILED or CANCELLED
      await prisma.purchase.update({
        where: { id: purchaseId },
        data: { status: 'failed' },
      });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('[payfast/ITN] Error:', err);
    // Always return 200 to PayFast — on error, log and investigate
    return new NextResponse('OK', { status: 200 });
  }
}
