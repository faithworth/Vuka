/**
 * POST /api/admin/yoco/register-webhook
 *
 * Yoco has no dashboard screen for webhooks at all — registration is
 * API-only. Their docs describe a v1 subscription model:
 * POST /v1/webhooks/subscriptions/ with { notification_url, event_types }.
 * Hit this once (as an admin), and Yoco returns a signing secret
 * (whsec_...) — set that as YOCO_WEBHOOK_SECRET in Vercel.
 *
 * UNCERTAINTY FLAG: Yoco's docs describe what look like two separate
 * webhook systems — an older Checkout-API-specific one and this v1
 * subscriptions one — and it isn't fully clear from public docs alone
 * which one fires for a Checkout created via payments.yoco.com/api/checkouts.
 * If this 404s or errors, check the response body for the actual expected
 * shape and adjust; the receiver at /api/checkout/yoco/webhook logs the
 * raw payload of whatever actually arrives so we can confirm empirically
 * with one real test transaction.
 *
 * Body: { url: string } — defaults to
 * `${NEXT_PUBLIC_APP_URL}/api/checkout/yoco/webhook` if omitted.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';

const YOCO_V1_API_BASE = 'https://api.yoco.com/v1';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: 'YOCO_SECRET_KEY not configured' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
  const notificationUrl = body.url || `${appUrl}/api/checkout/yoco/webhook`;

  try {
    const res = await fetch(`${YOCO_V1_API_BASE}/webhooks/subscriptions/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        notification_url: notificationUrl,
        event_types: ['payment.created', 'payment.refunded'],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error('[admin/yoco/register-webhook] Yoco API error', { status: res.status, data });
      return NextResponse.json({ error: 'Yoco rejected the registration — see detail for the exact expected shape', detail: data }, { status: res.status });
    }

    logger.info('[admin/yoco/register-webhook] Webhook subscription registered', { notificationUrl, subscriptionId: data.id });

    // The `secret` field is only ever returned here, at creation time —
    // Yoco will not show it again. Copy it into YOCO_WEBHOOK_SECRET now.
    return NextResponse.json({
      ok: true,
      subscriptionId: data.id,
      notificationUrl: data.notification_url,
      secret: data.secret,
      instructions: 'Copy the "secret" value into YOCO_WEBHOOK_SECRET in Vercel env vars now — Yoco will not display it again. Then trigger one real test payment and check logs for "[yoco/webhook] RAW PAYLOAD" to confirm the actual shape.',
    });
  } catch (err) {
    logger.error('[admin/yoco/register-webhook] Request failed', { error: String(err) });
    return NextResponse.json({ error: 'Request to Yoco failed' }, { status: 500 });
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: 'YOCO_SECRET_KEY not configured' }, { status: 500 });

  try {
    const res = await fetch(`${YOCO_V1_API_BASE}/webhooks/subscriptions/`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'Request to Yoco failed' }, { status: 500 });
  }
}
