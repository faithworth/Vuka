// ============================================================
// src/lib/plans.ts
// Single source of truth for Vuka's subscription plans and
// platform fee rates. Import from here everywhere — never
// hardcode a percentage in a route or component.
// ============================================================

export interface VukaPlan {
  slug:            string;
  name:            string;
  priceZAR:        number;   // 0 = free
  billingPeriod:   'MONTHLY' | 'YEARLY' | 'FREE';
  platformFeePct:  number;   // what Vuka keeps (e.g. 15 = 15%)
  artistSharePct:  number;   // what artist keeps
  releasesPerYear: number | null; // null = unlimited
  features:        string[];
}

export const PLANS: VukaPlan[] = [
  {
    slug:            'free',
    name:            'Free',
    priceZAR:        0,
    billingPeriod:   'FREE',
    platformFeePct:  15,
    artistSharePct:  85,
    releasesPerYear: 2,
    features: [
      'Up to 2 releases per year',
      'Beat store & licensing',
      'Fan memberships',
      'PDF license generation',
      'PayFast + Flutterwave payments',
      'Basic analytics',
    ],
  },
  {
    slug:            'pro',
    name:            'Pro',
    priceZAR:        249,
    billingPeriod:   'MONTHLY',
    platformFeePct:  8,
    artistSharePct:  92,
    releasesPerYear: null,
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
    slug:            'label',
    name:            'Label',
    priceZAR:        999,
    billingPeriod:   'MONTHLY',
    platformFeePct:  5,
    artistSharePct:  95,
    releasesPerYear: null,
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
  return PLANS.find(p => p.slug === (slug ?? DEFAULT_PLAN_SLUG)) ?? PLANS[0];
}

/**
 * Resolve the effective plan for an artist, respecting expiry.
 * Pass the artist's planSlug AND planExpiresAt from the DB.
 * If the plan has expired, returns Free regardless of planSlug.
 */
export function getEffectivePlan(
  slug: string | null | undefined,
  expiresAt: Date | null | undefined,
): VukaPlan {
  if (expiresAt && new Date() > new Date(expiresAt)) {
    return PLANS[0]; // expired — drop to Free
  }
  return getPlan(slug);
}

/** Fee rate as a decimal (e.g. 0.15) for a given plan slug */
export function platformFeeRate(planSlug: string | null | undefined, expiresAt?: Date | null): number {
  return getEffectivePlan(planSlug, expiresAt).platformFeePct / 100;
}

/** Artist net after platform fee */
export function artistNet(grossAmount: number, planSlug: string | null | undefined, expiresAt?: Date | null): number {
  const fee = Math.round(grossAmount * platformFeeRate(planSlug, expiresAt) * 100) / 100;
  return Math.round((grossAmount - fee) * 100) / 100;
}

/** Platform fee amount */
export function platformFee(grossAmount: number, planSlug: string | null | undefined, expiresAt?: Date | null): number {
  return Math.round(grossAmount * platformFeeRate(planSlug, expiresAt) * 100) / 100;
}
