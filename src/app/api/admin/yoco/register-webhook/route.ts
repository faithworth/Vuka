/**
 * POST /api/admin/yoco/register-webhook
 *
 * Yoco has no dashboard screen for webhooks at all — registration is
 * API-only (POST https://payments.yoco.com/api/webhooks). This endpoint
 * exists purely so a human doesn't need to hand-craft that curl request:
 * hit this once (as an admin), and Yoco returns a signing secret
 * (whsec_...) — set that as YOCO_WEBHOOK_SECRET in Vercel.
 *
 * Body: { url: string } — defaults to
 * `${NEXT_PUBLIC_APP_URL}/api/checkout/yoco/webhook` if omitted.
 *
 * Safe to call again later (e.g. to re-point at a different URL, or after
 * losing the secret) — each call creates a fresh registration. If you
 * only need to re-fetch, GET this same route lists existing registrations
 * instead (Yoco doesn't re-display an existing secret, only a fresh one).
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
      body: JSON.stringify({
        name: 'vuka-purchase-confirmation',
        url,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error('[admin/yoco/register-webhook] Yoco API error', { status: res.status, data });
      return NextResponse.json({ error: 'Yoco rejected the registration', detail: data }, { status: res.status });
    }

    logger.info('[admin/yoco/register-webhook] Webhook registered', { url, webhookId: data.id });

    // The `secret` field is only ever returned here, at creation time —
    // Yoco will not show it again. Copy it into YOCO_WEBHOOK_SECRET now.
    return NextResponse.json({
      ok: true,
      webhookId: data.id,
      url: data.url,
      secret: data.secret,
      instructions: 'Copy the "secret" value into YOCO_WEBHOOK_SECRET in Vercel env vars now — Yoco will not display it again.',
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
