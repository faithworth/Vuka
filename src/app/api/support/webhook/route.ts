/**
 * POST /api/support/webhook
 *
 * DEPRECATED — Paystack only supports ONE webhook URL per account, which is
 * registered as /api/checkout/paystack/webhook. That route dispatches SUP_
 * references here in code (see handleSupportEvent in
 * @/lib/webhooks/paystack-handlers), not via a second HTTP call. Paystack
 * itself never hits this URL. Kept as a thin delegating wrapper — not the
 * old duplicate logic — so nothing can silently drift out of sync again if
 * something external still points at this path.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyPaystackWebhook } from '@/lib/paystack';
import { handleSupportEvent } from '@/lib/webhooks/paystack-handlers';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const traceId   = req.headers.get('x-trace-id') ?? 'no-trace';
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const rawBody   = await req.text();

  if (!verifyPaystackWebhook(rawBody, signature)) {
    logger.warn('[support/webhook] Invalid signature', { traceId });
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new NextResponse('Bad JSON', { status: 400 }); }

  if (event.event !== 'charge.success') return NextResponse.json({ ok: true });

  const reference = event.data?.reference ?? '';
  if (!reference.startsWith('SUP_')) return NextResponse.json({ ok: true });

  await handleSupportEvent(event, traceId);
  return NextResponse.json({ ok: true });
}
