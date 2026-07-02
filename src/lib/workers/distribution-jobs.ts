/**
 * VUKA — Background Jobs (Payout Dispatcher)
 *
 * Vuka Music is a direct-to-fan SALES platform. We do not distribute to DSPs
 * (Spotify, Apple Music, etc.), so the old DSP delivery queue processor
 * has been removed along with the DSPDelivery / DistributionRelease
 * pipeline it operated on.
 *
 * autoDispatchApprovedPayouts:
 *   - Finds PayoutRequests with status 'approved'
 *   - Dispatches each via the payout processor (Paystack / PayPal)
 *   - Runs Monday–Friday via cron
 */

import prisma from '../prisma';
import { logger } from '../logger';
import { dispatchPayout } from '../earnings';

// ── PAYOUT AUTO-DISPATCHER ────────────────────────────────────

export async function autoDispatchApprovedPayouts(): Promise<{
  dispatched: number;
  failed: number;
  durationMs: number;
}> {
  const start = Date.now();
  let dispatched = 0;
  let failed = 0;

  // Only dispatch if it's a weekday (Mon–Fri)
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    logger.info('[payout-worker] Skipping auto-dispatch — weekend');
    return { dispatched: 0, failed: 0, durationMs: Date.now() - start };
  }

  const approvedRequests = await prisma.payoutRequest.findMany({
    where: {
      status: 'approved',
      // Only dispatch requests approved more than 30 min ago (gives admin time to cancel)
      approvedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    take: 20, // Cap per run to avoid overload
    orderBy: { approvedAt: 'asc' },
  });

  for (const request of approvedRequests) {
    try {
      const result = await dispatchPayout(request.id);

      if (result.success) {
        dispatched++;
        logger.info('[payout-worker] Payout dispatched', {
          requestId: request.id,
          amount: request.amount,
          currency: request.currency,
          referenceId: result.referenceId,
        });
      } else {
        failed++;
        logger.error('[payout-worker] Payout dispatch failed', {
          requestId: request.id,
          error: result.error,
        });
      }
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[payout-worker] Payout exception', { requestId: request.id, error: msg });
    }
  }

  const durationMs = Date.now() - start;
  logger.info('[payout-worker] autoDispatchApprovedPayouts complete', {
    dispatched, failed, durationMs,
  });

  return { dispatched, failed, durationMs };
}
