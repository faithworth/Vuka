/**
 * GET /api/connect/onboard
 * Artists configure payouts via bank account in /dashboard/settings.
 */
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=payouts&info=paystack`);
}
