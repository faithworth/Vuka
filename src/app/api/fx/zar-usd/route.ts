/**
 * GET /api/fx/zar-usd
 *
 * Returns the live ZAR→USD exchange rate.
 * Cached in-process for 6 hours. Public route — no auth required.
 *
 * Used by the PayPal button to display the USD equivalent before checkout.
 *
 * Response:
 *   { zarToUsdRate: 0.054, source: "open.er-api.com", fetchedAt: "..." }
 */

import { NextResponse } from 'next/server';
import { getZarToUsdRate } from '@/lib/fx';

export async function GET() {
  const fx = await getZarToUsdRate();

  return NextResponse.json(fx, {
    headers: {
      // Allow CDN/browser to cache for 1 hour — stale-while-revalidate for 6h
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600',
    },
  });
}
