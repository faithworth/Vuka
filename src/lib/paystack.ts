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
  };
}

// ── Webhook Signature Verification ───────────────────────────────────────────

export function verifyPaystackWebhook(rawBody: string, signature: string): boolean {
  if (!SECRET_KEY) return false;
  const expected = crypto
    .createHmac('sha512', SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}
