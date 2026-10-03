// src/lib/pricing-floor.ts
//
// Minimum-price safety rules so a sale never costs Vuka more in payment-gateway
// fees than Vuka earns from it. Pure functions — safe to import in client code.
//
// Free items (R0) are always fine: no payment is taken, so no fee is charged.

/** Smallest paid amount we accept through Yoco / Paystack (card, EFT). */
export const CARD_MIN_ZAR = 20;

/** Absolute floor for PayPal, whatever the plan. */
export const PAYPAL_MIN_ZAR = 50;

/** PayPal's commercial rate for South African accounts: 4.9% + US$0.30. */
export const PAYPAL_PCT_FEE = 4.9;
export const PAYPAL_FIXED_USD = 0.3;

/** Error text for a paid card payment that is too small, or null if fine. */
export function cardFloorError(amountZAR: number): string | null {
  if (amountZAR > 0 && amountZAR < CARD_MIN_ZAR) {
    return `Paid purchases start at R${CARD_MIN_ZAR}. Choose R${CARD_MIN_ZAR} or more, or R0 if the artist offers it free.`;
  }
  return null;
}

/** Error text for an artist-set price that is not R0 and is below the floor. */
export function listPriceError(amountZAR: number): string | null {
  if (amountZAR > 0 && amountZAR < CARD_MIN_ZAR) {
    return `Prices must be R0 (free) or at least R${CARD_MIN_ZAR}, so payment fees never exceed the sale.`;
  }
  return null;
}

/**
 * Smallest ZAR price at which a PayPal sale still covers PayPal's fee out of
 * Vuka's platform cut. Returns null when the artist's plan fee is no larger than
 * PayPal's percentage fee — PayPal can never break even on such a plan.
 *
 * @param platformFeePct  Vuka's cut on the artist's plan (e.g. 15, 8, 5)
 * @param zarPerUsd       current exchange rate (ZAR for 1 USD)
 */
export function paypalMinZAR(platformFeePct: number, zarPerUsd: number): number | null {
  const marginPct = platformFeePct - PAYPAL_PCT_FEE;
  if (marginPct <= 0) return null;
  const fixedFeeZAR = PAYPAL_FIXED_USD * zarPerUsd;
  const breakEven = Math.ceil(fixedFeeZAR / (marginPct / 100));
  return Math.max(PAYPAL_MIN_ZAR, breakEven);
}
