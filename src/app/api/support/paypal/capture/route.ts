export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import paypal from '@/lib/paypal';
import { getZarToUsdRate } from '@/lib/fx';
import { handleSupportPayment } from '@/lib/webhooks/paystack-handlers';

export async function POST(req: NextRequest) {
  try {
    const { txnId, orderId } = await req.json();
    if (!txnId || !orderId) return NextResponse.json({ error: 'txnId and orderId are required' }, { status: 400 });

    const txn = await prisma.supportTxn.findUnique({ where: { id: txnId } });
    if (!txn) return NextResponse.json({ error: 'Support transaction not found' }, { status: 404 });
    if (txn.status === 'confirmed') return NextResponse.json({ ok: true, duplicate: true });
    if (txn.paystackReference !== `paypal:${orderId}`) return NextResponse.json({ error: 'Payment reference mismatch' }, { status: 409 });

    const result = await paypal.orders.capture(orderId, `vuka-support-capture-${txn.id}`);
    if (result.status !== 'COMPLETED') return NextResponse.json({ error: `Payment not completed (status: ${result.status})` }, { status: 402 });

    const capturedUSD = Number(result.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || 0);
    const fx = await getZarToUsdRate();
    const expectedUSD = Number(fx.zarToUsdRate > 0 ? (txn.amount * fx.zarToUsdRate).toFixed(2) : '0');
    if (Math.abs(capturedUSD - expectedUSD) > 0.02) {
      return NextResponse.json({ error: 'Captured amount does not match the support amount.' }, { status: 409 });
    }

    const ok = await handleSupportPayment(`paypal:${orderId}`, txn.amount, txn.currency, 'paypal', 'paypal-support');
    if (!ok) return NextResponse.json({ error: 'Support payment could not be confirmed.' }, { status: 500 });

    return NextResponse.json({ ok: true, txnId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PayPal support capture failed' }, { status: 500 });
  }
}
