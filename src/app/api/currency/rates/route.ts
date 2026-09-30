import { NextResponse } from 'next/server';
import { getZarToUsdRate, SUPPORTED_CURRENCIES } from '@/lib/fx';

export const dynamic = 'force-dynamic';

export async function GET() {
  const fx = await getZarToUsdRate();
  const rates = Object.fromEntries(
    SUPPORTED_CURRENCIES.map(code => [code, fx.rates[code] ?? (code === 'ZAR' ? 1 : undefined)]).filter(([, rate]) => typeof rate === 'number')
  );
  return NextResponse.json({ base: 'ZAR', rates, fetchedAt: fx.fetchedAt.toISOString(), source: fx.source }, {
    headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
  });
}