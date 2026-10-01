/**
 * VUKA — FX Rate Engine
 *
 * Fetches live ZAR/USD exchange rate for PayPal international payments.
 * No API key required. Updates every 6 hours in memory.
 *
 * Primary:  open.er-api.com (free, no key, updates daily)
 * Fallback: frankfurter.app  (ECB rates, free, no key)
 * Safety:   hardcoded conservative rate if both fail
 *
 * The rate used at purchase time is stored on the Purchase row so
 * refunds can be calculated exactly regardless of rate drift.
 *
 * Usage:
 *   import { getZarToUsdRate, zarToUsd, usdToZar } from '@/lib/fx';
 *   const rate = await getZarToUsdRate();
 *   const usd  = zarToUsd(priceZAR, rate);
 */

// ── In-process cache ──────────────────────────────────────────────────────
// Vercel serverless functions share nothing between invocations, but within
// a warm instance this prevents hammering the FX API on every checkout.

export const SUPPORTED_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'BWP', 'ZMW', 'AUD', 'CAD'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

interface RateCache {
  rates:      Record<string, number>;
  fetchedAt:  number;
  source:     string;
}

let _cache: RateCache | null = null;

const CACHE_TTL_MS      = 6 * 60 * 60 * 1000;  // 6 hours
const SAFETY_RATE       = 0.052;                 // conservative fallback (~R19.20/$1)
const FETCH_TIMEOUT_MS  = 4_000;

// ── Fetchers ──────────────────────────────────────────────────────────────

async function fetchFromOpenErApi(): Promise<Record<string, number> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch('https://open.er-api.com/v6/latest/ZAR', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data = await res.json() as {
      result: string;
      rates:  Record<string, number>;
    };

    if (data.result !== 'success') return null;

    const rates: Record<string, number> = { ZAR: 1 };
    for (const code of SUPPORTED_CURRENCIES) {
      const rate = data.rates?.[code];
      if (typeof rate === 'number' && rate > 0) rates[code] = rate;
    }
    return rates.USD ? rates : null;

  } catch {
    return null;
  }
}

async function fetchFromFrankfurter(): Promise<Record<string, number> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch('https://api.frankfurter.app/latest?from=ZAR&to=USD', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data = await res.json() as {
      rates: Record<string, number>;
    };

    const rate = data.rates?.USD;
    return typeof rate === 'number' && rate > 0 ? { ZAR: 1, USD: rate } : null;

  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export interface FxRate {
  /** 1 ZAR expressed in USD, e.g. 0.054 */
  zarToUsdRate: number;
  /** 1 ZAR expressed in supported currencies */
  rates: Record<string, number>;
  /** Source of the rate */
  source: 'open.er-api.com' | 'frankfurter.app' | 'hardcoded-fallback' | 'cache';
  /** When this rate was fetched */
  fetchedAt: Date;
}

/**
 * Get the current ZAR → USD rate.
 * Returns a cached value if fresh, otherwise fetches live.
 * Never throws — falls back to a hardcoded conservative rate.
 */
export async function getZarToUsdRate(): Promise<FxRate> {
  // Return cache if still fresh
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return {
      zarToUsdRate: _cache.rates.USD ?? SAFETY_RATE,
      rates:        _cache.rates,
      source:       'cache',
      fetchedAt:    new Date(_cache.fetchedAt),
    };
  }

  // Try primary source
  let rates = await fetchFromOpenErApi();
  let source: FxRate['source'] = 'open.er-api.com';

  // Try fallback
  if (!rates) {
    rates  = await fetchFromFrankfurter();
    source = 'frankfurter.app';
  }

  // Safety fallback — never fail a checkout over a missing FX rate
  if (!rates) {
    if (_cache) {
      return { zarToUsdRate: _cache.rates.USD ?? SAFETY_RATE, rates: _cache.rates, source: 'cache', fetchedAt: new Date(_cache.fetchedAt) };
    }
    rates = { ZAR: 1, USD: SAFETY_RATE };
    source = 'hardcoded-fallback';
  }

  _cache = { rates, fetchedAt: Date.now(), source };
  return { zarToUsdRate: rates.USD ?? SAFETY_RATE, rates, source, fetchedAt: new Date(_cache.fetchedAt) };
}

/**
 * Convert a ZAR amount to USD using a given rate.
 * Rounds to 2 decimal places. Minimum $0.01.
 */
export function zarToUsd(zarAmount: number, rate: number): number {
  const raw     = zarAmount * rate;
  const rounded = Math.round(raw * 100) / 100;
  return Math.max(rounded, 0.01);
}

/**
 * Convert a USD amount back to ZAR using a given rate.
 * Rounds to 2 decimal places.
 */
export function usdToZar(usdAmount: number, rate: number): number {
  if (rate <= 0) return 0;
  return Math.round((usdAmount / rate) * 100) / 100;
}

/**
 * Format a USD amount for display.
 * e.g. 12.5 → "$12.50"
 */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format a ZAR amount for display.
 * e.g. 150 → "R150.00"
 */
export function formatZar(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

export function convertFromZar(amountZar: number, currency: string, rates: Record<string, number>): number {
  const rate = currency === 'ZAR' ? 1 : rates[currency];
  if (!rate || !Number.isFinite(rate)) return amountZar;
  return Math.round(amountZar * rate * 100) / 100;
}


