// ============================================================
// src/lib/yoco.ts
//
// Yoco Checkout API — buyer-facing payment collection, replacing Paystack
// as Vuka's primary checkout processor.
//
// IMPORTANT: Yoco has no third-party transfer/payout API — it only settles
// into Vuka's own business bank account, never to a third party like an
// artist. It is therefore NEVER used for artist/industry payouts; that
// stays on Paystack (and later Flutterwave) — see the dispatchPayout /
// dispatchIndustryPayout functions in src/lib/earnings.ts, which are
// unaffected by this file.
// ============================================================

import crypto from 'crypto';

const YOCO_API_BASE = 'https://payments.yoco.com/api';

export function generateReference(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
}

// Creates a Yoco Checkout — the buyer is redirected to `redirectUrl` to
// enter card details on Yoco's hosted page.
export async function createYocoCheckout(params: {
  amountZAR: number;
  currency?: string;
  reference: string;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ checkoutId: string; redirectUrl: string }> {
  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey) throw new Error('YOCO_SECRET_KEY not configured');

  // Yoco doesn't accept payments under R2.00 (200 cents).
  const amountCents = Math.round(params.amountZAR * 100);
  if (amountCents < 200) {
    throw new Error('Amount below Yoco\'s R2.00 minimum');
  }

  const res = await fetch(`${YOCO_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({
      amount: amountCents,
      currency: params.currency || 'ZAR',
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      failureUrl: params.failureUrl,
      metadata: { reference: params.reference, ...params.metadata },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Yoco checkout create failed ${res.status}: ${body}`);
  }

  const data: { id: string; redirectUrl: string } = await res.json();
  return { checkoutId: data.id, redirectUrl: data.redirectUrl };
}

// Independently verifies a checkout's status directly from Yoco, rather
// than trusting the webhook payload's amount/status alone — same principle
// as Paystack's verifyTransaction().
export async function fetchYocoCheckout(checkoutId: string): Promise<{
  status: string;
  amount: number;   // cents
  currency: string;
  metadata?: Record<string, string>;
}> {
  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey) throw new Error('YOCO_SECRET_KEY not configured');

  const res = await fetch(`${YOCO_API_BASE}/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`Yoco checkout fetch failed ${res.status}`);
  return res.json();
}

// ── Webhook signature verification (Svix-format, used by Yoco) ────────
//
// Headers: webhook-id, webhook-timestamp, webhook-signature
// Signed content = `${id}.${timestamp}.${rawBody}`
// Secret has a `whsec_` prefix that must be stripped before base64-decoding.
// webhook-signature is space-separated "v1,<base64sig>" entries — any
// match is valid.
export function verifyYocoWebhook(rawBody: string, headers: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}): boolean {
  const webhookSecret = process.env.YOCO_WEBHOOK_SECRET;
  if (!webhookSecret || !headers.id || !headers.timestamp || !headers.signature) return false;

  // Replay protection — reject anything signed more than 5 minutes ago/ahead.
  const timestampSec = parseInt(headers.timestamp, 10);
  if (!Number.isFinite(timestampSec) || Math.abs(Date.now() / 1000 - timestampSec) > 300) return false;

  const secretBytes = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expectedSig = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  const candidates = headers.signature.split(' ').map(s => s.split(',')[1]).filter(Boolean);

  return candidates.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    } catch {
      return false; // length mismatch — definitely not a match
    }
  });
}
