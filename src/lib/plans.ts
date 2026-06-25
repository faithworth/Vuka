/**
 * VUKA — Subscription Plans & Platform Fee Engine
 *
 * Single source of truth for all plan definitions and fee calculations.
 * Import from here everywhere — never hardcode a percentage in a route or component.
 *
 * Payment providers by region:
 *   Paystack — South African artists and buyers (ZAR)
 *   PayPal   — International artists and buyers (USD)
 */

export interface VukaPlan {
  slug:             string;
  name:             string;
  priceZAR:         number;                    // 0 = free tier
  billingPeriod:    'MONTHLY' | 'YEARLY' | 'FREE';
  platformFeePct:   number;                    // what Vuka keeps (e.g. 10 = 10%)
  artistSharePct:   number;                    // what artist keeps
  releasesPerMonth: number | null;             // null = unlimited
  releasesPerYear?: number | null;
  features:         string[];
}

export const PLANS: VukaPlan[] = [
  {
    slug:             'free',
    name:             'Free',
    priceZAR:         0,
    billingPeriod:    'FREE',
    platformFeePct:   10,
    // Starting rate — auto-steps DOWN as lifetime sales grow. See FREE_TIER_STEPS.
    artistSharePct:   90,
    releasesPerMonth: 2,
    features: [
      'Up to 2 releases per month',
      'Beat store & licensing',
      'Fan memberships',
      'PDF license generation',
      'Paystack (ZA) + PayPal (International)',
      'Basic analytics',
      'Platform fee reduces automatically as you sell — no subscription needed',
    ],
  },
  {
    slug:             'pro',
    name:             'Pro',
    priceZAR:         249,
    billingPeriod:    'MONTHLY',
    platformFeePct:   8,
    artistSharePct:   92,
    releasesPerMonth: null,
    features: [
      'Unlimited releases',
      'Lower 8% platform fee',
      'Priority support',
      'Advanced analytics',
      'Industry marketplace access',
      'Everything in Free',
    ],
  },
  {
    slug:             'label',
    name:             'Label',
    priceZAR:         999,
    billingPeriod:    'MONTHLY',
    platformFeePct:   5,
    artistSharePct:   95,
    releasesPerMonth: null,
    features: [
      'Unlimited releases',
      'Lowest 5% platform fee',
      'Multiple artists under one account',
      'Bulk payout management',
      'White-label storefront',
      'Everything in Pro',
    ],
  },
];

export const DEFAULT_PLAN_SLUG = 'free';

/** Look up a plan by slug — falls back to Free if not found */
export function getPlan(slug: string | null | undefined): VukaPlan {
  return PLANS.find((p) => p.slug === (slug ?? DEFAULT_PLAN_SLUG)) ?? PLANS[0];
}

/**
 * Resolve the effective plan for an artist, respecting expiry.
 * If the plan has expired, returns Free regardless of planSlug.
 */
export function getEffectivePlan(
  slug:      string | null | undefined,
  expiresAt: Date | null | undefined,
): VukaPlan {
  if (expiresAt && new Date() > new Date(expiresAt)) return PLANS[0];
  return getPlan(slug);
}

// ── Auto-stepping fee thresholds (Free tier only) ─────────────────────────
//
//  R0        → R2,000   lifetime gross  → 10%
//  R2,001    → R10,000  lifetime gross  → 9%
//  R10,001+             lifetime gross  → 8.5%  (permanent Free-tier floor)
//
// Tracked on Artist.lifetimeGrossSales. Updates automatically on every sale.
// No opt-in required — the rate just improves as the artist grows.

export const FREE_TIER_STEPS = [
  { upTo: 2_000,    feePct: 10   },
  { upTo: 10_000,   feePct: 9    },
  { upTo: Infinity, feePct: 8.5  },
] as const;

/**
 * Resolve the auto-stepped fee rate for a Free-tier artist.
 * Returns a decimal (e.g. 0.10, 0.09, 0.085).
 */
export function freeTierFeeRate(lifetimeGrossSales: number): number {
  for (const step of FREE_TIER_STEPS) {
    if (lifetimeGrossSales <= step.upTo) return step.feePct / 100;
  }
  return 0.085;
}

/**
 * Human-readable fee rate label for UI display.
 * e.g. "10%" for a new Free artist, "8%" for a Pro artist.
 */
export function feeRateLabel(
  planSlug:           string | null | undefined,
  expiresAt:          Date | null | undefined,
  lifetimeGrossSales = 0,
): string {
  const plan = getEffectivePlan(planSlug, expiresAt);
  if (plan.slug === 'free') {
    const pct = freeTierFeeRate(lifetimeGrossSales) * 100;
    return `${pct % 1 === 0 ? pct.toFixed(0) : pct}%`;
  }
  return `${plan.platformFeePct}%`;
}

/**
 * Fee rate as a decimal for a given plan.
 * For Free-tier pass lifetimeGrossSales to get the stepped rate.
 * For paid plans, lifetimeGrossSales is ignored.
 */
export function platformFeeRate(
  planSlug:           string | null | undefined,
  expiresAt?:         Date | null,
  lifetimeGrossSales = 0,
): number {
  const plan = getEffectivePlan(planSlug, expiresAt);
  if (plan.slug === 'free') return freeTierFeeRate(lifetimeGrossSales);
  return plan.platformFeePct / 100;
}

/** Artist net earnings after platform fee — rounded to 2 decimal places */
export function artistNet(
  grossAmount:        number,
  planSlug:           string | null | undefined,
  expiresAt?:         Date | null,
  lifetimeGrossSales = 0,
): number {
  const fee = platformFee(grossAmount, planSlug, expiresAt, lifetimeGrossSales);
  return Math.round((grossAmount - fee) * 100) / 100;
}

/** Platform fee amount — rounded to 2 decimal places */
export function platformFee(
  grossAmount:        number,
  planSlug:           string | null | undefined,
  expiresAt?:         Date | null,
  lifetimeGrossSales = 0,
): number {
  return Math.round(grossAmount * platformFeeRate(planSlug, expiresAt, lifetimeGrossSales) * 100) / 100;
}

/**
 * Check if an artist has hit their monthly upload limit.
 * Returns { allowed: true } or { allowed: false, limit: N }.
 */
export function checkMonthlyUploadLimit(
  planSlug:         string | null | undefined,
  expiresAt:        Date | null | undefined,
  uploadsThisMonth: number,
): { allowed: boolean; limit: number | null } {
  const plan = getEffectivePlan(planSlug, expiresAt);
  if (plan.releasesPerMonth === null) return { allowed: true, limit: null };
  if (uploadsThisMonth >= plan.releasesPerMonth) {
    return { allowed: false, limit: plan.releasesPerMonth };
  }
  return { allowed: true, limit: plan.releasesPerMonth };
}
