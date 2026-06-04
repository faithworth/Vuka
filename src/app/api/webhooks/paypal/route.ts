// src/app/api/webhooks/paypal/route.ts
// Phase 7 — PayPal webhook handler
// Handles PAYMENT.PAYOUTS-ITEM.* events.
// In production: verify webhook signature using PayPal SDK or manual verification.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { handlePayPalWebhook } from '@/lib/earnings';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const payload = JSON.parse(body);

    // PayPal webhook verification (production):
    // Verify using PAYPAL_WEBHOOK_ID + cert_url + transmission headers.
    // See: https://developer.paypal.com/api/rest/webhooks/
    // const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    // const transmissionId = req.headers.get('paypal-transmission-id');
    // ... full verification flow ...

    // Only process payout item events
    if (!payload.event_type?.startsWith('PAYMENT.PAYOUTS-ITEM')) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await handlePayPalWebhook(payload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook/paypal] Error:', err);
    // Return 200 — PayPal will retry on non-2xx
    return NextResponse.json({ ok: true, error: 'Internal processing error' });
  }
}
