// src/app/api/webhooks/paypal/route.ts
// Handles PAYMENT.PAYOUTS-ITEM.* events from PayPal.
// Verifies webhook authenticity before processing.
//
// Required env vars:
//   PAYPAL_WEBHOOK_ID        — from PayPal Developer Dashboard → Webhooks
//   PAYPAL_CLIENT_ID         — PayPal app client ID
//   PAYPAL_CLIENT_SECRET     — PayPal app client secret
//   PAYPAL_API_BASE          — https://api-m.sandbox.paypal.com (sandbox) or https://api-m.paypal.com (live)

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { handlePayPalWebhook } from '@/lib/earnings';

// ── PayPal webhook signature verification ──────────────────────────────────
// Uses PayPal's /v1/notifications/verify-webhook-signature endpoint.
// PayPal signs each webhook delivery with transmission headers;
// we echo them back and PayPal confirms authenticity.

async function getPayPalAccessToken(): Promise<string> {
  const base     = process.env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com';
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret   = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !secret) {
    throw new Error('[paypal-webhook] PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set');
  }

  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`[paypal-webhook] Token request failed: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

async function verifyPayPalSignature(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn('[paypal-webhook] PAYPAL_WEBHOOK_ID not set — skipping signature check');
    return false;
  }

  const transmissionId  = headers.get('paypal-transmission-id');
  const transmissionTime = headers.get('paypal-transmission-time');
  const certUrl         = headers.get('paypal-cert-url');
  const authAlgo        = headers.get('paypal-auth-algo');
  const transmissionSig = headers.get('paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.error('[paypal-webhook] Missing required PayPal signature headers');
    return false;
  }

  // Validate cert URL is actually PayPal (security: prevent SSRF via spoofed cert URL)
  if (!certUrl.startsWith('https://api.paypal.com/') && !certUrl.startsWith('https://api.sandbox.paypal.com/')) {
    console.error('[paypal-webhook] Invalid cert URL:', certUrl);
    return false;
  }

  try {
    const base        = process.env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com';
    const accessToken = await getPayPalAccessToken();

    const verifyRes = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo:           authAlgo,
        cert_url:            certUrl,
        transmission_id:     transmissionId,
        transmission_sig:    transmissionSig,
        transmission_time:   transmissionTime,
        webhook_id:          webhookId,
        webhook_event:       JSON.parse(rawBody),
      }),
    });

    if (!verifyRes.ok) {
      console.error('[paypal-webhook] Verification request failed:', verifyRes.status);
      return false;
    }

    const result = await verifyRes.json();
    return result.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('[paypal-webhook] Signature verification error:', err);
    return false;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify signature — reject unverified requests
    const isValid = await verifyPayPalSignature(req.headers, rawBody);
    if (!isValid) {
      console.error('[paypal-webhook] Signature verification failed — rejecting');
      // Return 200 so PayPal stops retrying; log and alert rather than exposing 401
      return NextResponse.json({ ok: false, reason: 'invalid_signature' });
    }

    const payload = JSON.parse(rawBody);

    // Only process payout item events
    if (!payload.event_type?.startsWith('PAYMENT.PAYOUTS-ITEM')) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await handlePayPalWebhook(payload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook/paypal] Error:', err);
    return NextResponse.json({ ok: true, error: 'Internal processing error' });
  }
}
