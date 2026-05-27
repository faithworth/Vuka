export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { syncSearchIndex, computeAllTrending, cleanupStaleData } from '@/lib/workers/jobs';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/workers/cron?job=search_sync|trending|cleanup|all
 * Protected by CRON_SECRET header or query param.
 * Configure in vercel.json crons or call from pg_cron.
 */
export async function GET(req: NextRequest) {
  // Auth check
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get('job') ?? 'all';
  const results: Record<string, unknown> = {};

  try {
    if (job === 'search_sync' || job === 'all') {
      results.searchIndex = await syncSearchIndex();
    }
    if (job === 'trending' || job === 'all') {
      await computeAllTrending();
      results.trending = 'refreshed';
    }
    if (job === 'cleanup' || job === 'all') {
      results.cleanup = await cleanupStaleData();
    }

    return NextResponse.json({ ok: true, job, results, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Cron] Job failed:', job, err);
    return NextResponse.json({ error: 'Job failed', job }, { status: 500 });
  }
}
