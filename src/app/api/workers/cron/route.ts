/**
 * GET /api/workers/cron
 *
 * Protected by CRON_SECRET — only Vercel Cron, pg_cron, or trusted schedulers
 * should call this endpoint.
 *
 * Jobs:
 *   ?job=search_sync    — Rebuild SearchIndex from active beats/releases/artists
 *   ?job=trending       — Refresh all TrendingSnapshot combinations (8 total)
 *   ?job=cleanup        — Prune stale SpamSignal, PageView, Notification rows
 *   ?job=milestones     — Detect and dispatch follower/sales milestone notifications
 *   ?job=all            — Run all four jobs sequentially
 *
 * Vercel cron.json example (add to vercel.json):
 *   { "path": "/api/workers/cron?job=search_sync", "schedule": "0 * * * *"   }
 *   { "path": "/api/workers/cron?job=trending",    "schedule": "*/15 * * * *" }
 *   { "path": "/api/workers/cron?job=cleanup",     "schedule": "0 3 * * *"   }
 *   { "path": "/api/workers/cron?job=milestones",  "schedule": "0 6 * * *"   }
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { syncSearchIndex, computeAllTrending, cleanupStaleData, checkMilestones } from '@/lib/workers/jobs';
import { logger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;

type JobName = 'search_sync' | 'trending' | 'cleanup' | 'milestones' | 'all';

export async function GET(req: NextRequest) {
  // Auth — accept secret via header (Vercel) or query param (pg_cron)
  const secret =
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret');

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    logger.warn('[cron] Unauthorized attempt', {
      ip: req.headers.get('x-forwarded-for') ?? 'unknown',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const job = (req.nextUrl.searchParams.get('job') ?? 'all') as JobName;
  const validJobs: JobName[] = ['search_sync', 'trending', 'cleanup', 'milestones', 'all'];

  if (!validJobs.includes(job)) {
    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });
  }

  const results: Record<string, unknown> = {};
  const startTotal = Date.now();

  logger.info('[cron] Job starting', { job });

  try {
    if (job === 'search_sync' || job === 'all') {
      results.searchIndex = await syncSearchIndex();
    }
    if (job === 'trending' || job === 'all') {
      results.trending = await computeAllTrending();
    }
    if (job === 'cleanup' || job === 'all') {
      results.cleanup = await cleanupStaleData();
    }
    if (job === 'milestones' || job === 'all') {
      results.milestones = await checkMilestones();
    }

    const totalMs = Date.now() - startTotal;
    logger.info('[cron] Job complete', { job, totalMs });

    return NextResponse.json({
      ok:        true,
      job,
      results,
      totalMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[cron] Job failed', {
      job,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Job failed', job, message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
