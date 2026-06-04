/**
 * POST /api/support/webhook
 *
 * Phase 12 — Stripe webhook removed. Support payments flow through PayFast only.
 * PayFast ITN for support transactions is handled by /api/support/payfast-notify.
 *
 * This file is kept so any existing webhook registration at the old URL
 * returns 200 (not 404) to prevent PayFast/logging noise.
 */

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function POST() {
  // Stripe webhook intentionally removed — support payments via PayFast only.
  // Real support ITN handled at /api/support/payfast-notify
  return NextResponse.json({ received: true, note: 'Use /api/support/payfast-notify for PayFast ITN' });
}
