// ============================================================
// src/app/api/cron/renew-plans/route.ts
// Daily cron — auto-renews Pro/Label plan subscriptions that have a saved,
// reusable Paystack authorization by charging it, instead of silently
// letting the artist drop to Free (expire-plans' behavior for everyone
// else). This is the "auto-billing" gap from the production-readiness
// audit (known issue: payments/no-auto-recurring-billing).
//
// Dunning policy (kept deliberately simple for v1):
//   - Runs BEFORE expire-plans (see vercel.json schedule) so a successful
//     renewal updates currentPeriodEnd before expire-plans can touch it.
//   - 1st charge failure on a subscription: don't expire it yet — grant a
//     3-day grace window (currentPeriodEnd += 3 days) and record failedAt/
//     failReason, so expire-plans doesn't drop them immediately on a
//     transient decline.
//   - 2nd consecutive failure (failedAt was already set from a prior run):
//     give up — mark the subscription 'expired' so expire-plans downgrades
//     the artist to Free on its next run, same as an artist with no saved
//     card at all.
//   - Subscriptions with no paystackToken (no reusable authorization was
//     ever captured — e.g. paid via bank transfer, or the bank opted the
//     card out of reusable charges) are left untouched; expire-plans
//     handles those exactly as it does today.
//
// Call via Vercel cron (vercel.json) or external service:
//   GET /api/cron/renew-plans
//   Header: Authorization: Bearer YOUR_CRON_SECRET
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { renewSubscription } from '@/lib/renew-plans';

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const results = { renewed: 0, grace: 0, expired: 0, skipped: 0, errors: [] as string[] };

  try {
    const due = await (prisma as any).artistPlanSubscription.findMany({
      where: {
        status:           'active',
        currentPeriodEnd: { lte: now },
        paystackToken:    { not: null },
      },
      include: {
        artist: { include: { user: { select: { email: true } } } },
      },
    });

    for (const sub of due) {
      const { outcome } = await renewSubscription(sub, now);
      results[outcome]++;
    }

    logger.info('[cron/renew-plans] Complete', results);
    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[cron/renew-plans] Error', { error: message });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
