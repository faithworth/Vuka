/**
 * POST /api/redownload
 *
 * Resend download links to a buyer by email.
 *
 * Security: always returns 200 regardless of whether the email has purchases.
 * This prevents email enumeration — an attacker cannot tell if an email is
 * registered by watching for 404 vs 200.
 *
 * Rate limited to 3 requests per hour per IP to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { sendRedownloadLinks } from '@/lib/emails';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const schema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
});

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();
  const ip      = getClientIp(req.headers);

  // ── Rate limit — 3 attempts per hour per IP ───────────────────────────
  const limited = await rateLimit(ip, RATE_LIMITS.magic_link_request, ip);
  if (limited) {
    // Still return 200 to avoid exposing the rate limit as an enumeration signal
    return NextResponse.json({ ok: true });
  }

  // ── Parse body ────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const { email } = parsed.data;

  // ── Look up confirmed purchases ───────────────────────────────────────
  // Silently exit if none found — never expose whether email is registered
  const purchases = await prisma.purchase.findMany({
    where: {
      buyerEmail: { equals: email, mode: 'insensitive' },
      status:     'confirmed',
    },
    include: {
      beat:    { select: { title: true } },
      release: { select: { title: true } },
      video:   { select: { title: true } },
      sample:  { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    20,
  });

  if (purchases.length === 0) {
    // Always 200 — do not reveal whether this email has purchases
    logger.info('[redownload] No purchases found — silent 200', { traceId });
    return NextResponse.json({ ok: true });
  }

  // ── Build purchase list ───────────────────────────────────────────────
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.vuka.co.za';
  const buyerName   = purchases[0]?.buyerName ?? 'Customer';

  const purchaseList = purchases.map((p) => ({
    itemName:    p.beat?.title
               ?? p.release?.title
               ?? p.video?.title
               ?? p.sample?.title
               ?? 'Purchase',
    downloadUrl: `${appUrl}/download/${p.downloadToken}`,
  }));

  // ── Send email ────────────────────────────────────────────────────────
  try {
    await sendRedownloadLinks({ to: email, buyerName, purchases: purchaseList });
  } catch (err) {
    logger.error('[redownload] Email send failed', { err, traceId });
    // Return 200 — email failures shouldn't reveal system state either
  }

  return NextResponse.json({ ok: true });
}
