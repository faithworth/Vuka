/**
 * POST /api/admin/yoco/register-webhook
 *
 * Yoco has no dashboard screen for webhooks at all — registration is
 * API-only. This hits the Checkout API's own webhook registration
 * (payments.yoco.com/api/webhooks, same base + auth as checkout creation)
 * — NOT the separate api.yoco.com/v1 "subscriptions" system, which
 * returned 401 against our secret key (confirmed empirically: that system
 * needs different credentials entirely, likely OAuth/JWT, and isn't what
 * our Checkout-API-based integration uses).
 *
 * Hit this once (as an admin), and Yoco returns a signing secret
 * (whsec_...) — set that as YOCO_WEBHOOK_SECRET in Vercel.
 *
 * Body: { url: string } — defaults to
 * `${NEXT_PUBLIC_APP_URL}/api/checkout/yoco/webhook` if omitted.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';

const YOCO_API_BASE = 'https://payments.yoco.com/api';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const secretKey = process.env.YOCO_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: 'YOCO_SECRET_KEY not configured' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
  const url = body.url || `${appUrl}/api/checkout/yoco/webhook`;

  try {
    const res = await fetch(`${YOCO_API_BASE}/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({ name: 'vuka-purchase-confirmation', url }),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error('[admin/yoco/register-webhook] Yoco API error', { status: res.status, data });
      return NextResponse.json({ error: 'Yoco rejected the registration — see detail for the exact expected shape', detail: data }, { status: res.status });
    }

    logger.info('[admin/yoco/register-webhook] Webhook registered', { url, webhookId: data.id });

    return NextResponse.json({
      ok: true,
      webhookId: data.id,
      url: data.url,
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
    const res = await fetch(`${YOCO_API_BASE}/webhooks`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'Request to Yoco failed' }, { status: 500 });
  }
}
