/**
 * POST /api/payouts/paypal/send
 *
 * Admin-only: sends PayPal payouts to approved international artist payout requests.
 * Only handles requests with method='paypal' and an attached paypalEmail.
 *
 * The flow:
 *   1. Admin approves a payout request in the admin panel
 *   2. Admin calls this endpoint with the requestId
 *   3. We send a PayPal payout batch (single item)
 *   4. We record the PayPal batch ID and mark the request as processing
 *   5. Webhook updates to success/failed when PayPal settles
 *
 * Required env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import paypal, { isPayPalConfigured } from '@/lib/paypal';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/monitoring/sentry';
import crypto from 'crypto';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const schema = z.object({
  requestId: z.string().min(1),
});

async function getAdminUser(req: NextRequest) {
  // Next.js 15: cookies() returns a Promise now — must be awaited before
  // calling any method on it (getAll, get, etc).
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();

  // ── Admin auth ─────────────────────────────────────────────────────────
  const admin = await getAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isPayPalConfigured()) {
    return NextResponse.json(
      { error: 'PayPal not configured on this server' },
      { status: 503 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { requestId } = parsed.data;

  // ── Load payout request ────────────────────────────────────────────────
  const payoutRequest = await prisma.payoutRequest.findUnique({
    where:  { id: requestId },
    include: {
      artist: {
        select: { id: true, name: true, paypalEmail: true, planSlug: true },
      },
    },
  });

  if (!payoutRequest) {
    return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });
  }

  if (payoutRequest.status !== 'approved') {
    return NextResponse.json(
      { error: `Request is not in approved state (current: ${payoutRequest.status})` },
      { status: 409 }
    );
  }

  if (payoutRequest.method !== 'paypal') {
    return NextResponse.json(
      { error: 'This request is not a PayPal payout — use the correct payout method' },
      { status: 400 }
    );
  }

  const paypalEmail = payoutRequest.paypalEmail ?? payoutRequest.artist?.paypalEmail;
  if (!paypalEmail) {
    return NextResponse.json(
      { error: 'No PayPal email on this payout request or artist profile' },
      { status: 400 }
    );
  }

  // ── Convert amount to USD ──────────────────────────────────────────────
  // Payouts are always processed in USD for international artists
  const amountZAR = payoutRequest.amount;
  const amountUSD = payoutRequest.currency === 'USD'
    ? amountZAR
    : parseFloat((amountZAR * 0.054).toFixed(2)); // ZAR→USD, update rate periodically

  if (amountUSD < 1.00) {
    return NextResponse.json(
      { error: 'Minimum PayPal payout is $1.00 USD' },
      { status: 400 }
    );
  }

  const idempotencyKey = `vuka-payout-${requestId}`;

  // ── Send PayPal payout ─────────────────────────────────────────────────
  let batchResult;
  try {
    batchResult = await paypal.payouts.send(
      [{
        email:        paypalEmail,
        amountUSD,
        note:         `Vuka Music earnings payout — Request #${requestId.slice(-8).toUpperCase()}`,
        senderItemId: requestId,
      }],
      idempotencyKey,
    );
  } catch (err) {
    captureException(err, { action: 'paypal-payout-send', requestId, traceId });
    logger.error('[PayPal payout] Send failed', { err, requestId, traceId });
    return NextResponse.json(
      { error: 'PayPal payout failed. Check credentials and Payouts API access.' },
      { status: 502 }
    );
  }

  const batchId = batchResult.batch_header.payout_batch_id;

  // ── Update payout request ──────────────────────────────────────────────
  await prisma.payoutRequest.update({
    where: { id: requestId },
    data: {
      status:        'processing',
      processedAt:   new Date(),
      paystackReference: `paypal_batch:${batchId}`,
      notes:         `PayPal batch ${batchId} — ${amountUSD} USD → ${paypalEmail}`,
    },
  });

  await audit({
    action:     'payment.payout_processed',
    targetType: 'payoutRequest',
    targetId:   requestId,
    meta:       { batchId, amountUSD, amountZAR, paypalEmail, traceId },
  });

  logger.info('[PayPal payout] Sent', {
    requestId, batchId, amountUSD, paypalEmail, traceId,
  });

  return NextResponse.json({
    ok:      true,
    batchId,
    amountUSD,
    status:  batchResult.batch_header.batch_status,
  });
}

/**
 * GET /api/payouts/paypal/send?batchId=...
 * Check batch status (admin only)
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const batchId = req.nextUrl.searchParams.get('batchId');
  if (!batchId) {
    return NextResponse.json({ error: 'batchId required' }, { status: 400 });
  }

  try {
    const status = await paypal.payouts.getBatchStatus(batchId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
