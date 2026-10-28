/**
 * Legacy Paystack direct-checkout endpoint.
 *
 * New purchases must use Yoco or PayPal. This endpoint remains so stale
 * clients receive an explicit response instead of silently starting a
 * Paystack transaction. The Paystack webhook remains available to reconcile
 * payments that were already in flight before the cutover.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'Paystack checkout is no longer supported. Use Yoco or PayPal.' },
    { status: 410 },
  );
}
