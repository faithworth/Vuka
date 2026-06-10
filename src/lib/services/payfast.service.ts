// src/lib/services/payfast.service.ts
// PayFast payment integration for South African payments.
// Handles: payment initiation, ITN webhook verification, signature validation.
//
// Environment variables required:
//   PAYFAST_MERCHANT_ID       — your platform's PayFast Merchant ID (not the artist's)
//   PAYFAST_MERCHANT_KEY      — your platform's PayFast Merchant Key
//   PAYFAST_PASSPHRASE        — optional but recommended
//   PAYFAST_SANDBOX           — "true" for testing, omit/false for production
//   NEXT_PUBLIC_APP_URL       — your deployed URL (e.g. https://vuka.co.za)

import crypto from 'crypto';

const PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX === 'true';
const PAYFAST_HOST = PAYFAST_SANDBOX
  ? 'https://sandbox.payfast.co.za'
  : 'https://www.payfast.co.za';

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID ?? '';
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY ?? '';
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE ?? '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vuka.co.za';

// ── Build PayFast payment URL ─────────────────────────────────

export interface PayFastPaymentInput {
  purchaseId: string;      // our internal purchase ID for ITN reference
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  amountZAR: number;       // in Rands, e.g. 120.00
  itemName: string;        // e.g. "Trap Beat - Midnight"
  itemDescription?: string;
  returnUrl?: string;      // where to redirect on success
  cancelUrl?: string;      // where to redirect on cancel
}

export function buildPayFastPaymentUrl(input: PayFastPaymentInput): string {
  const {
    purchaseId, buyerFirstName, buyerLastName, buyerEmail,
    amountZAR, itemName, itemDescription,
    returnUrl = `${APP_URL}/purchase/success`,
    cancelUrl = `${APP_URL}/purchase/cancelled`,
  } = input;

  const data: Record<string, string> = {
    merchant_id: MERCHANT_ID,
    merchant_key: MERCHANT_KEY,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: `${APP_URL}/api/checkout/payfast/notify`,
    name_first: buyerFirstName.slice(0, 100),
    name_last: buyerLastName.slice(0, 100),
    email_address: buyerEmail,
    m_payment_id: purchaseId,
    amount: amountZAR.toFixed(2),
    item_name: itemName.slice(0, 100),
    ...(itemDescription ? { item_description: itemDescription.slice(0, 255) } : {}),
  };

  // Build signature
  const signature = buildSignature(data);
  data.signature = signature;

  const params = new URLSearchParams(data);
  return `${PAYFAST_HOST}/eng/process?${params.toString()}`;
}

// ── ITN Webhook Verification ──────────────────────────────────

export interface PayFastITNPayload {
  m_payment_id: string;          // our purchase ID
  pf_payment_id: string;         // PayFast's payment ID
  payment_status: 'COMPLETE' | 'FAILED' | 'CANCELLED';
  amount_gross: string;          // e.g. "120.00"
  amount_fee: string;
  amount_net: string;
  item_name: string;
  signature: string;
  [key: string]: string;
}

export async function verifyPayFastITN(
  payload: PayFastITNPayload,
  rawBody: string
): Promise<{ valid: boolean; reason?: string }> {
  // Step 1: Validate signature
  const { signature: receivedSig, ...rest } = payload;
  const calculatedSig = buildSignature(rest as Record<string, string>);
  if (calculatedSig !== receivedSig) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  // Step 2: Validate PayFast host (prevent spoofed ITN requests)
  // In production, verify the request IP is from PayFast's servers:
  // https://developers.payfast.co.za/api#notify-url
  // For now we validate signature only (production must add IP check).

  // Step 3: Validate payment status
  if (payload.payment_status !== 'COMPLETE') {
    return { valid: false, reason: `Payment status: ${payload.payment_status}` };
  }

  return { valid: true };
}

// ── Internal: Signature Builder ───────────────────────────────

function buildSignature(data: Record<string, string>): string {
  // Remove empty values, sort by key, URL encode
  const parts = Object.entries(data)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`)
    .join('&');

  const str = PASSPHRASE ? `${parts}&passphrase=${encodeURIComponent(PASSPHRASE)}` : parts;
  return crypto.createHash('md5').update(str).digest('hex');
}
