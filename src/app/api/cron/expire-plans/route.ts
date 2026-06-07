// ============================================================
// src/app/api/cron/expire-plans/route.ts
// Daily cron job — drops artists back to Free when their
// planExpiresAt date has passed.
//
// Call this via a Vercel cron (vercel.json) or an external
// cron service hitting:
//   GET /api/cron/expire-plans
//   Header: Authorization: Bearer YOUR_CRON_SECRET
//
// Add CRON_SECRET to your env vars (any random string).
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  // Secure the endpoint
  const auth   = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // Find all artists whose plan has expired
    const expired = await prisma.artist.findMany({
      where: {
        planSlug:      { not: 'free' },
        planExpiresAt: { lte: new Date() },
      },
      select: { id: true, name: true, planSlug: true, planExpiresAt: true },
    });

    if (expired.length === 0) {
      return NextResponse.json({ ok: true, expired: 0 });
    }

    // Drop them all back to Free, clear expiry
    await prisma.artist.updateMany({
      where: { id: { in: expired.map(a => a.id) } },
      data:  { planSlug: 'free', planExpiresAt: null },
    });

    logger.info('[cron/expire-plans] Expired plans', {
      count: expired.length,
      artists: expired.map(a => ({ id: a.id, name: a.name, was: a.planSlug })),
    });

    return NextResponse.json({ ok: true, expired: expired.length, artists: expired.map(a => a.name) });
  } catch (err) {
    logger.error('[cron/expire-plans] Error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
