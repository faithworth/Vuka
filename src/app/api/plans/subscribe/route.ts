/**
 * Legacy Paystack plan subscription endpoint.
 *
 * New plan payments must use the Yoco or PayPal endpoints. Kept as an explicit
 * 410 response so stale clients cannot start new Paystack transactions. The
 * Paystack webhook and verification path remain for transactions already in flight.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'Paystack plan checkout is no longer supported. Choose Yoco or PayPal.' },
    { status: 410 },
  );
}
