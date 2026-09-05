export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  syncSearchIndex,
  computeAllTrending,
  cleanupStaleData,
  checkMilestones,
} from '@/lib/workers/jobs';
import { autoReleaseEscrow } from '@/lib/marketplace';
import prisma from '@/lib/prisma';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/workers/cron?job=<name>
 *
 * Protected by CRON_SECRET (set in Doppler / Vercel env).
 * Vercel Cron invokes this route with `Authorization: Bearer <CRON_SECRET>`
 * (Vercel's documented convention for the CRON_SECRET env var) — that header
 * is checked first. `x-cron-secret` header / `?secret=` query param are also
 * accepted as a fallback for any other internal invocation, though nothing
 * in this codebase currently uses them.
 *
 * Jobs:
 *   search_sync   — sync Meilisearch / SearchIndex table
 *   trending      — recompute trending scores
 *   milestones    — check follower/sales milestones
 *   cleanup       — prune stale/temp data
 *   payout_process — flag stale approved payouts for admin attention
 *   all           — run all jobs in sequence
 *
 * Note: Vuka Music is a direct-to-fan sales platform (no DSP distribution), so the
 * legacy `notify_live` (DistributionRelease) and `distribution_retry`
 * (DSPDelivery) jobs have been removed. Releases on the `Release` model go
 * live instantly when the artist publishes — no delayed "went live" job is
 * needed.
 */
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const secret =
    bearerSecret ??
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

    // ── payout_process ────────────────────────────────────────────
    // Automatically processes approved payout requests
    // (Final payment execution still requires admin approval in the UI —
    //  this job only handles status transitions and reminders)
    if (job === 'payout_process' || job === 'all') {
      try {
        // Find payouts stuck in 'approved' status: either approved >24h ago,
        // OR approvedAt is null (a bug elsewhere left it unset — treat as
        // stale immediately rather than silently excluding it forever).
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const stalePayouts = await prisma.payoutRequest.findMany({
          where: {
            status: 'approved',
            OR: [
              { approvedAt: { lt: twentyFourHoursAgo } },
              { approvedAt: null },
            ],
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
          staleApprovedAmount: stalePayouts.reduce((sum, p: any) => sum + p.amount, 0),
          staleIds: stalePayouts.map((p: any) => p.id),
          missingApprovedAtCount: stalePayouts.filter((p: any) => !p.approvedAt).length,
          note: 'Stale approved payouts flagged — admin action required',
        };
      } catch (e: any) {
        results.payoutProcess = { error: e.message };
      }
    }

    // ── marketplace_release ──────────────────────────────
    // Auto-releases marketplace escrow orders that have sat in 'delivered'
    // for 7+ days with no buyer confirmation and no dispute.
    if (job === 'marketplace_release' || job === 'all') {
      try {
        results.marketplaceRelease = await autoReleaseEscrow();
      } catch (e: any) {
        results.marketplaceRelease = { error: e.message };
      }
    }

    // —— royalty_run ——
    // Weekly automatic payout for artists + industry users. Not run as part
    // of 'all' — it has its own weekly cron entry in vercel.json (Mondays)
    // so it never fires accidentally alongside the daily jobs. This is now
    // the ONLY way payouts are triggered — self-serve requests were removed.
    if (job === 'royalty_run') {
      try {
        results.royaltyRun = await runWeeklyRoyaltyRun();
      } catch (e: any) {
        results.royaltyRun = { error: e.message };
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
