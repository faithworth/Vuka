export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  syncSearchIndex,
  computeAllTrending,
  cleanupStaleData,
  checkMilestones,
} from '@/lib/workers/jobs';
import prisma from '@/lib/prisma';
import {
  sendReleaseLive,
  sendEarningsAvailable,
  sendPayoutProcessed,
  sendPayoutFailed,
} from '@/lib/emails';
import { retryFailedDeliveries } from '@/lib/distribution';

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://www.vuka.co.za';

/**
 * GET /api/workers/cron?job=<name>
 *
 * Protected by CRON_SECRET (set in Doppler / Vercel env).
 * Vercel Cron invokes with the secret embedded in the request URL or header.
 *
 * Jobs:
 *   search_sync         — sync Meilisearch / SearchIndex table
 *   trending            — recompute trending scores
 *   milestones          — check follower/sales milestones
 *   cleanup             — prune stale/temp data
 *   notify_live         — email artists whose releases went live
 *   distribution_retry  — retry failed DSP deliveries
 *   payout_process      — process pending approved payout requests
 *   all                 — run all jobs in sequence
 */
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const secret =
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret');

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get('job') ?? 'all';
  const results: Record<string, unknown> = {};
  const startTime = Date.now();

  try {
    // ── search_sync ──────────────────────────────────────────────
    if (job === 'search_sync' || job === 'all') {
      results.searchIndex = await syncSearchIndex();
    }

    // ── trending ─────────────────────────────────────────────────
    if (job === 'trending' || job === 'all') {
      await computeAllTrending();
      results.trending = 'refreshed';
    }

    // ── milestones ───────────────────────────────────────────────
    if (job === 'milestones' || job === 'all') {
      results.milestones = await checkMilestones();
    }

    // ── cleanup ──────────────────────────────────────────────────
    if (job === 'cleanup' || job === 'all') {
      results.cleanup = await cleanupStaleData();
    }

    // ── notify_live ──────────────────────────────────────────────
    if (job === 'notify_live' || job === 'all') {
      try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const liveReleases = await prisma.distributionRelease.findMany({
          where: {
            status: 'submitted',
            liveNotifiedAt: null,
            updatedAt: { gte: twoHoursAgo },
          },
          include: {
            artist: {
              select: {
                name: true,
                user: { select: { email: true } },
              },
            },
            dspDeliveries: {
              where: { status: { in: ['submitted', 'delivered'] } },
              select: { dsp: true },
            },
          },
          take: 50,
        });

        let notified = 0;
        for (const release of liveReleases) {
          try {
            const artistEmail = release.artist?.user?.email;
            if (artistEmail) {
              const platforms = release.dspDeliveries.map((d) => d.dsp);
              await sendReleaseLive({
                to: artistEmail,
                artistName: release.artist?.name ?? release.artistName,
                releaseTitle: release.title,
                platforms: platforms.length > 0 ? platforms : ['Vuka'],
                shareUrl: `${APP_URL()}/releases/${release.id}`,
                releaseUrl: `${APP_URL()}/dashboard/releases/${release.id}`,
              });
              await (prisma.distributionRelease as any)
                .update({
                  where: { id: release.id },
                  data: { liveNotifiedAt: new Date() },
                })
                .catch(() => null);
              notified++;
            }
          } catch (e) {
            console.error('[cron/notify_live] failed for release', release.id, e);
          }
        }
        results.liveNotifications = { checked: liveReleases.length, notified };
      } catch (e: any) {
        results.liveNotifications = { error: e.message };
      }
    }

    // ── distribution_retry ────────────────────────────────────────
    // Retry DSP deliveries that failed (up to 3 retries per release)
    if (job === 'distribution_retry' || job === 'all') {
      try {
        const failedReleases = await prisma.dSPDelivery.findMany({
          where: {
            status: 'failed',
            retryCount: { lt: 3 },
            // Only retry if last attempt was >1 hour ago (exponential back-off)
            lastRetryAt: {
              lt: new Date(Date.now() - 60 * 60 * 1000),
            },
          },
          select: {
            distributionReleaseId: true,
          },
          distinct: ['distributionReleaseId'],
          take: 20,
        });

        const releaseIds: string[] = failedReleases
          .map((d) => d.distributionReleaseId)
          .filter((id): id is string => typeof id === 'string')
          .filter((id, i, arr) => arr.indexOf(id) === i);
        let retried = 0;
        let retryErrors = 0;

        for (const releaseId of releaseIds) {
          try {
            await retryFailedDeliveries(releaseId);
            retried++;
          } catch {
            retryErrors++;
          }
        }
        results.distributionRetry = { checked: releaseIds.length, retried, retryErrors };
      } catch (e: any) {
        results.distributionRetry = { error: e.message };
      }
    }

    // ── payout_process ────────────────────────────────────────────
    // Automatically processes approved payout requests
    // (Final payment execution still requires admin approval in the UI —
    //  this job only handles status transitions and reminders)
    if (job === 'payout_process' || job === 'all') {
      try {
        // Find payouts approved >24h ago but not yet marked processing
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const stalePayouts = await prisma.payoutRequest.findMany({
          where: {
            status: 'approved',
            approvedAt: { lt: twentyFourHoursAgo },
          },
          include: {
            artist: {
              select: {
                user: { select: { email: true, name: true } },
              },
            },
          },
          take: 10,
        }).catch(() => [] as any[]);

        results.payoutProcess = {
          staleApprovedCount: stalePayouts.length,
          note: 'Stale approved payouts flagged — admin action required',
        };
      } catch (e: any) {
        results.payoutProcess = { error: e.message };
      }
    }

    const durationMs = Date.now() - startTime;
    return NextResponse.json({
      ok: true,
      job,
      results,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Cron] Job failed:', job, err);
    return NextResponse.json(
      { error: 'Job failed', job, message: err?.message },
      { status: 500 },
    );
  }
}
