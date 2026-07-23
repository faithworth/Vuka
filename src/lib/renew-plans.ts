// ============================================================
// src/lib/renew-plans.ts
// Core per-subscription renewal logic, shared by:
//   - the real daily cron (src/app/api/cron/renew-plans/route.ts)
//   - the internal test harness (mode=trigger-renew), so testing can
//     invoke the exact same renewal logic in-process, with zero new
//     HTTP auth surface and without ever touching CRON_SECRET.
// ============================================================
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { chargeAuthorization, generateReference } from '@/lib/paystack';
import { PLANS } from '@/lib/plans';
import { sendBroadcast } from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

export const GRACE_PERIOD_DAYS = 3;

export type RenewOutcome = 'renewed' | 'grace' | 'expired' | 'skipped';

// Renews ONE subscription: charges its saved authorization, and applies
// the grace/expire dunning policy on failure. Callers are responsible for
// selecting which subscription(s) to pass in — this function never
// queries beyond the single row it's given.
export async function renewSubscription(sub: any, now: Date = new Date()): Promise<{ outcome: RenewOutcome; detail?: string }> {
  const plan = PLANS.find(p => p.slug === sub.planSlug);
  const email = sub.artist?.user?.email;

  if (!plan || plan.priceZAR === 0 || !email) {
    return { outcome: 'skipped' };
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
      return { outcome: 'renewed' };
    }

    throw new Error(charge.gatewayResponse || `Charge status: ${charge.status}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);

    if (sub.failedAt) {
      await (prisma as any).artistPlanSubscription.update({
        where: { id: sub.id },
        data:  { status: 'expired', failReason: reason },
      });
      await auditLog.adminAction(
        'plan.auto_renew_failed_final', 'Artist', sub.artistId, 'system',
        `Auto-renewal failed twice for ${sub.planSlug} — expiring, artist will drop to Free: ${reason}`,
      );
      if (email) {
        sendBroadcast({
          to: email,
          displayName: sub.artist?.name || 'there',
          subject: `Your Vuka ${sub.planSlug} plan has ended`,
          title: 'Your plan has moved to Free',
          body: `We tried twice to renew your ${sub.planSlug} plan and both charges failed, so your account has moved to the Free plan.\n\nUpdate your payment details any time to upgrade again — nothing else about your account or releases has changed.`,
          ctaLabel: 'Update payment details →',
          ctaUrl: `${APP_URL()}/dashboard/settings#billing`,
        }).catch(e => logger.error('[renew-plans] final-expiry email failed', { artistId: sub.artistId, error: String(e) }));
      }
      return { outcome: 'expired', detail: reason };
    }

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
    if (email) {
      sendBroadcast({
        to: email,
        displayName: sub.artist?.name || 'there',
        subject: `Payment issue with your Vuka ${sub.planSlug} plan`,
        title: 'We couldn\u2019t renew your plan',
        body: `Your card was declined when we tried to renew your ${sub.planSlug} plan.\n\nYou have ${GRACE_PERIOD_DAYS} days to update your payment details before your account moves to the Free plan.`,
        ctaLabel: 'Update payment details →',
        ctaUrl: `${APP_URL()}/dashboard/settings#billing`,
      }).catch(e => logger.error('[renew-plans] grace email failed', { artistId: sub.artistId, error: String(e) }));
    }
    return { outcome: 'grace', detail: reason };
  }
}
