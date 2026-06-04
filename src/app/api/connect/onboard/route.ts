/**
 * GET /api/connect/onboard
 *
 * Phase 12 — Stripe Connect REMOVED.
 * Artists configure payouts via PayFast Merchant ID in /dashboard/settings.
 *
 * This endpoint now redirects to the settings page with a helpful message.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  // Redirect to settings where PayFast merchant ID is configured
  return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=payouts&info=payfast`);
}
