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
import { auditLog } from '@/lib/audit';
import { chargeAuthorization, generateReference } from '@/lib/paystack';
import { PLANS } from '@/lib/plans';

const GRACE_PERIOD_DAYS = 3;

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
      const plan = PLANS.find(p => p.slug === sub.planSlug);
      const email = sub.artist?.user?.email;

      if (!plan || plan.priceZAR === 0 || !email) {
        results.skipped++;
        continue;
      }

      const reference = generateReference('RENEW');

      try {
        const charge = await chargeAuthorization({
          email,
          amountZAR:         plan.priceZAR,
          authorizationCode: sub.paystackToken,
          reference,
          metadata: { artistId: sub.artistId, planSlug: sub.planSlug, type: 'plan_renewal' },
        });

        if (charge.status === 'success') {
          const newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

          await prisma.$transaction([
            (prisma as any).artistPlanSubscription.update({
              where: { id: sub.id },
              data: {
                currentPeriodStart: now,
                currentPeriodEnd:   newPeriodEnd,
                paystackReference:  reference,
                failedAt:           null,
                failReason:         null,
              },
            }),
            prisma.artist.update({
              where: { id: sub.artistId },
              data:  { planExpiresAt: newPeriodEnd },
            }),
          ]);

          await auditLog.adminAction(
            'plan.auto_renewed', 'Artist', sub.artistId, 'system',
            `Auto-renewed ${sub.planSlug} via saved Paystack authorization (${reference})`,
          );
          results.renewed++;
          continue;
        }

        // Charge attempted but declined (not a network/API error) — falls
        // through to the failure handling below.
        throw new Error(charge.gatewayResponse || `Charge status: ${charge.status}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);

        if (sub.failedAt) {
          // Already failed once — give up, let expire-plans downgrade it.
          await (prisma as any).artistPlanSubscription.update({
            where: { id: sub.id },
            data:  { status: 'expired', failReason: reason },
          });
          await auditLog.adminAction(
            'plan.auto_renew_failed_final', 'Artist', sub.artistId, 'system',
            `Auto-renewal failed twice for ${sub.planSlug} — expiring, artist will drop to Free: ${reason}`,
          );
          results.expired++;
        } else {
          // First failure — grace window, try again next run.
          const graceEnd = new Date(sub.currentPeriodEnd);
          graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);
          await (prisma as any).artistPlanSubscription.update({
            where: { id: sub.id },
            data:  { currentPeriodEnd: graceEnd, failedAt: now, failReason: reason },
          });
          await auditLog.adminAction(
            'plan.auto_renew_failed_grace', 'Artist', sub.artistId, 'system',
            `Auto-renewal failed for ${sub.planSlug}, granting ${GRACE_PERIOD_DAYS}-day grace: ${reason}`,
          );
          results.grace++;
        }
      }
    }

    logger.info('[cron/renew-plans] Complete', results);
    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[cron/renew-plans] Error', { error: message });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
