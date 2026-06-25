/**
 * VUKA — Stripe (Removed)
 *
 * Stripe has been removed from the Vuka platform.
 *
 * All payments are handled via:
 *   Paystack  — South African artists and buyers (ZAR, instant EFT, card)
 *   PayPal    — International artists and buyers (USD)
 *
 * This file exists only so any legacy import resolves without a build crash.
 * Do NOT use any export from this file.
 */

export const stripe = null as unknown as never;

export async function createCheckoutSession(): Promise<never> {
  throw new Error(
    '[Vuka] Stripe is not active. Use Paystack (/api/checkout/paystack/initialize) ' +
    'or PayPal (/api/checkout/paypal/create-order).'
  );
}

export async function createConnectAccountLink(): Promise<never> {
  throw new Error('[Vuka] Stripe Connect is not active. Use Paystack Payouts or PayPal Payouts.');
}

export async function createConnectAccount(): Promise<never> {
  throw new Error('[Vuka] Stripe Connect is not active. Use Paystack Payouts or PayPal Payouts.');
}
