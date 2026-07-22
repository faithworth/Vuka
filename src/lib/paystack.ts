/**
 * src/lib/paystack.ts
 * Vuka Music — Paystack integration (replaces src/lib/payfast.ts)
 *
 * Required env vars:
 *   PAYSTACK_SECRET_KEY  — sk_live_... or sk_test_...
 *   NEXT_PUBLIC_APP_URL  — https://vukamusic.com
 */

import crypto from 'crypto';

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? '';
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vukamusic.com';

// ── Reference generator ───────────────────────────────────────────────────────

export function generateReference(prefix = 'VK'): string {
  return `${prefix}_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// ── Initialize Transaction ────────────────────────────────────────────────────

export interface InitializeTransactionInput {
  email:        string;
  amountZAR:    number;
  reference:    string;
  callbackUrl?: string;
  metadata?:    Record<string, unknown>;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode:       string;
  reference:        string;
}

export async function initializeTransaction(
  input: InitializeTransactionInput,
): Promise<InitializeTransactionResult> {
  const { email, amountZAR, reference, callbackUrl, metadata } = input;

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount:       Math.round(amountZAR * 100),
      reference,
      currency:     'ZAR',
      callback_url: callbackUrl ?? `${APP_URL}/checkout/success`,
      ...(metadata ? { metadata } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Paystack initializeTransaction failed: ${(err as any).message ?? res.status}`);
  }

  const json = await res.json();
  return {
    authorizationUrl: json.data.authorization_url,
    accessCode:       json.data.access_code,
    reference:        json.data.reference,
  };
}

// ── Verify Transaction ────────────────────────────────────────────────────────

export interface VerifyTransactionResult {
  status:        string;
  reference:     string;
  amountZAR:     number;
  amountKobo:    number;
  currency:      string;
  paidAt:        string;
  channel:       string;
  metadata:      Record<string, unknown>;
  customerEmail: string;
  // Paystack returns a reusable authorization_code for card payments unless
  // the customer's bank/card doesn't support it. This is what recurring
  // billing charges against later — it is NOT a stored card number (PCI
  // scope stays with Paystack). Only present + reusable on card channel.
  authorizationCode?: string;
  authorizationReusable?: boolean;
}

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${SECRET_KEY}` } },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Paystack verifyTransaction failed: ${(err as any).message ?? res.status}`);
  }

  const { data: d } = await res.json();
  return {
    status:        d.status,
    reference:     d.reference,
    amountKobo:    d.amount,
    amountZAR:     d.amount / 100,
    currency:      d.currency,
    paidAt:        d.paid_at,
    channel:       d.channel,
    metadata:      d.metadata ?? {},
    customerEmail: d.customer?.email ?? '',
    authorizationCode:     d.authorization?.authorization_code,
    authorizationReusable: d.authorization?.reusable === true,
  };
}

// ── Charge a saved (reusable) authorization ──────────────────────────────────
// Used by the recurring-billing cron to renew a plan subscription without the
// artist re-entering card details. Only call this with an authorizationCode
// that came from a VerifyTransactionResult where authorizationReusable was
// true — Paystack will reject anything else.

export interface ChargeAuthorizationInput {
  email:             string;
  amountZAR:         number;
  authorizationCode: string;
  reference:         string;
  metadata?:         Record<string, unknown>;
}

export interface ChargeAuthorizationResult {
  status:    string; // 'success' | 'failed' | other Paystack status strings
  reference: string;
  amountZAR: number;
  gatewayResponse: string;
}

export async function chargeAuthorization(
  input: ChargeAuthorizationInput,
): Promise<ChargeAuthorizationResult> {
  const { email, amountZAR, authorizationCode, reference, metadata } = input;

  const res = await fetch('https://api.paystack.co/transaction/charge_authorization', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount:             Math.round(amountZAR * 100),
      authorization_code: authorizationCode,
      reference,
      currency:           'ZAR',
      ...(metadata ? { metadata } : {}),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Paystack chargeAuthorization failed: ${(json as any).message ?? res.status}`);
  }

  const d = (json as any).data ?? {};
  return {
    status:          d.status,
    reference:       d.reference ?? reference,
    amountZAR:       (d.amount ?? 0) / 100,
    gatewayResponse: d.gateway_response ?? '',
  };
}

// ── Webhook Signature Verification ───────────────────────────────────────────

export function verifyPaystackWebhook(rawBody: string, signature: string): boolean {
  if (!SECRET_KEY || !signature) return false;
  const expected = crypto
    .createHmac('sha512', SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  // FIX: `expected === signature` short-circuits on the first differing
  // character, which leaks timing information an attacker can use to
  // guess the signature byte-by-byte. crypto.timingSafeEqual compares in
  // constant time. Buffers must be equal length before that call (it
  // throws otherwise), so check length first — a length mismatch is
  // itself a safe, non-secret-dependent signal to reject immediately.
  const expectedBuf  = Buffer.from(expected, 'hex');
  const signatureBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
