/**
 * POST /api/checkout/stripe/create-session
 *
 * Phase 12 — DEPRECATED. Stripe removed from Vuka.
 * Use /api/checkout/payfast/create-session instead.
 *
 * Returns a 410 Gone with redirect info so any client code fails gracefully.
 */

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Stripe has been removed from Vuka. Use /api/checkout/payfast/create-session',
      redirect: '/api/checkout/payfast/create-session',
    },
    { status: 410 }
  );
}
