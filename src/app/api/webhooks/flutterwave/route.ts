// src/app/api/webhooks/flutterwave/route.ts
// Phase 7 — Flutterwave webhook handler
// Handles transfer.completed and transfer.failed events.
// Verifies signature using FLUTTERWAVE_HASH env variable.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { handleFlutterwaveWebhook } from '@/lib/earnings';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('verif-hash');
    const expectedHash = process.env.FLUTTERWAVE_HASH;

    // Verify webhook signature
    if (expectedHash && signature !== expectedHash) {
      console.warn('[webhook/flutterwave] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(body);

    // Only process transfer events
    if (!payload.event?.startsWith('transfer.')) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await handleFlutterwaveWebhook(payload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook/flutterwave] Error:', err);
    // Always return 200 to prevent Flutterwave retrying on our errors
    return NextResponse.json({ ok: true, error: 'Internal processing error' });
  }
}
