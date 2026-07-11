import { describe, it, expect } from 'vitest';
import {
  platformFeeRate,
  platformFee,
  artistNet,
  freeTierFeeRate,
  getEffectivePlan,
  FREE_TIER_STEPS,
} from './plans';

// These tests exist because src/app/api/checkout/paystack/webhook/route.ts
// depends entirely on this module to decide how much of every sale the
// artist actually gets paid. The project's own PRODUCTION-READINESS-REPORT.md
// documents multiple previously-shipped bugs in exactly this calculation
// (0% fee bug, non-beat items silently defaulting to the wrong tier). This
// file is the regression net for that class of bug.

describe('freeTierFeeRate — auto-stepping fee thresholds', () => {
  it('charges 10% for a brand new artist (0 lifetime sales)', () => {
    expect(freeTierFeeRate(0)).toBeCloseTo(0.10);
  });

  it('charges 10% right up to the R2,000 boundary (inclusive)', () => {
    expect(freeTierFeeRate(2_000)).toBeCloseTo(0.10);
  });

  it('drops to 9% the moment lifetime sales exceed R2,000', () => {
    expect(freeTierFeeRate(2_000.01)).toBeCloseTo(0.09);
  });

  it('charges 9% right up to the R10,000 boundary (inclusive)', () => {
    expect(freeTierFeeRate(10_000)).toBeCloseTo(0.09);
  });

  it('drops to the permanent 8.5% floor beyond R10,000', () => {
    expect(freeTierFeeRate(10_000.01)).toBeCloseTo(0.085);
    expect(freeTierFeeRate(1_000_000)).toBeCloseTo(0.085);
  });

  it('the step table itself is monotonically decreasing (sanity check on config)', () => {
    for (let i = 1; i < FREE_TIER_STEPS.length; i++) {
      expect(FREE_TIER_STEPS[i].feePct).toBeLessThanOrEqual(FREE_TIER_STEPS[i - 1].feePct);
    }
  });
});

describe('platformFeeRate — resolves the correct rate per plan tier', () => {
  it('Pro plan is always a flat 8%, regardless of lifetime sales', () => {
    expect(platformFeeRate('pro', null, 0)).toBeCloseTo(0.08);
    expect(platformFeeRate('pro', null, 1_000_000)).toBeCloseTo(0.08);
  });

  it('Label plan is always a flat 5%', () => {
    expect(platformFeeRate('label', null, 50_000)).toBeCloseTo(0.05);
  });

  it('an unrecognized/null plan slug falls back to Free-tier behavior, not a hardcoded default', () => {
    expect(platformFeeRate(null, null, 0)).toBeCloseTo(0.10);
    expect(platformFeeRate('not-a-real-plan', null, 0)).toBeCloseTo(0.10);
  });

  it('a Pro artist whose plan has expired is charged Free-tier rates, not Pro rates', () => {
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    expect(platformFeeRate('pro', expired, 0)).toBeCloseTo(0.10);
  });

  it('a Pro artist with a future expiry keeps the Pro rate', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
    expect(platformFeeRate('pro', future, 0)).toBeCloseTo(0.08);
  });
});

describe('platformFee / artistNet — money math on a real sale', () => {
  it('a R500 beat sale for a new Free-tier artist charges exactly R50 (10%)', () => {
    expect(platformFee(500, 'free', null, 0)).toBeCloseTo(50);
    expect(artistNet(500, 'free', null, 0)).toBeCloseTo(450);
  });

  it('platformFee + artistNet always reconcile back to the gross amount', () => {
    // This is the property that actually matters financially: whatever the
    // rate, the fee and the artist's net must sum to the full sale price to
    // the cent, or money is silently created or destroyed.
    const cases: [number, string, number][] = [
      [199.99, 'free', 0],
      [199.99, 'free', 5_000],
      [999, 'pro', 0],
      [4999.5, 'label', 250_000],
    ];
    for (const [gross, plan, lifetime] of cases) {
      const fee = platformFee(gross, plan, null, lifetime);
      const net = artistNet(gross, plan, null, lifetime);
      expect(Math.round((fee + net) * 100) / 100).toBeCloseTo(gross, 2);
    }
  });

  it('rounds fee to 2 decimal places rather than leaving floating-point noise', () => {
    const fee = platformFee(33.33, 'pro', null, 0); // 33.33 * 0.08 = 2.6664
    expect(fee).toBe(Math.round(fee * 100) / 100);
  });

  it('a R0 sale (free giveaway / edge case) charges R0 fee, not NaN or a negative', () => {
    expect(platformFee(0, 'free', null, 0)).toBe(0);
    expect(artistNet(0, 'free', null, 0)).toBe(0);
  });
});

describe('getEffectivePlan', () => {
  it('returns Free for an expired plan even if the slug says otherwise', () => {
    const expired = new Date('2020-01-01');
    expect(getEffectivePlan('label', expired).slug).toBe('free');
  });

  it('returns the requested plan when not expired', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    expect(getEffectivePlan('label', future).slug).toBe('label');
  });

  it('a null expiry (no expiry set) never counts as expired', () => {
    expect(getEffectivePlan('label', null).slug).toBe('label');
  });
});
