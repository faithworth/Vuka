// src/app/api/admin/distribution/route.ts
// Phase 6 — Admin: Distribution queue monitor, manual retry, platform status overview
//
// GET  ?action=queue    — all DSPDelivery rows with status breakdown
// GET  ?action=releases — all DistributionRelease rows (admin view)
// POST { action: 'retry', deliveryId }      — retry a specific DSPDelivery
// POST { action: 'retry_release', releaseId } — retry all failed DSPs for a release
// POST { action: 'mark_live', deliveryId }  — manually mark a DSP delivery as live
// POST { action: 'process_queue' }          — trigger distribution queue processing now

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { retryFailedDeliveries, initiateDeliveryPipeline } from '@/lib/distribution';
import { processDistributionQueue } from '@/lib/workers/distribution-jobs';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'queue';

    if (action === 'queue') {
      const [deliveries, statusCounts] = await Promise.all([
        prisma.dSPDelivery.findMany({
          include: {
            distributionRelease: {
              select: {
                id: true, title: true, status: true, artistName: true,
                artist: { select: { name: true, slug: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        prisma.dSPDelivery.groupBy({
          by: ['status'],
          _count: true,
        }),
      ]);

      return NextResponse.json({ deliveries, statusCounts });
    }

    if (action === 'releases') {
      const status = searchParams.get('status') || 'all';
      const releases = await prisma.distributionRelease.findMany({
        where: status === 'all' ? {} : { status },
        include: {
          artist: { select: { name: true, slug: true } },
          tracks: { select: { id: true, title: true, isrc: true, trackNumber: true } },
          dspDeliveries: { orderBy: { dsp: 'asc' } },
          _count: { select: { tracks: true, dspDeliveries: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // Status summary counts
      const statusSummary = await prisma.distributionRelease.groupBy({
        by: ['status'],
        _count: true,
      });

      return NextResponse.json({ releases, statusSummary });
    }

    if (action === 'platforms') {
      // DSP delivery status overview
      const platformStats = await prisma.dSPDelivery.groupBy({
        by: ['dsp', 'status'],
        _count: true,
      });

      // Group by DSP
      const byDsp: Record<string, Record<string, number>> = {};
      for (const row of platformStats) {
        if (!byDsp[row.dsp]) byDsp[row.dsp] = {};
        byDsp[row.dsp][row.status] = row._count;
      }

      return NextResponse.json({ platforms: byDsp });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/distribution] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    if (action === 'retry') {
      const { deliveryId } = body;
      if (!deliveryId) return NextResponse.json({ error: 'deliveryId required' }, { status: 400 });

      const delivery = await prisma.dSPDelivery.findUnique({ where: { id: deliveryId } });
      if (!delivery) return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });

      await prisma.dSPDelivery.update({
        where: { id: deliveryId },
        data: { status: 'queued', errorMessage: '', retryCount: 0, lastRetryAt: new Date() },
      });

      return NextResponse.json({ ok: true, message: 'Delivery queued for retry' });
    }

    if (action === 'retry_release') {
      const { releaseId } = body;
      if (!releaseId) return NextResponse.json({ error: 'releaseId required' }, { status: 400 });

      await retryFailedDeliveries(releaseId);
      return NextResponse.json({ ok: true, message: 'All failed DSPs queued for retry' });
    }

    if (action === 'deliver_release') {
      const { releaseId } = body;
      if (!releaseId) return NextResponse.json({ error: 'releaseId required' }, { status: 400 });

      const result = await initiateDeliveryPipeline(releaseId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'mark_live') {
      const { deliveryId, dspReleaseId, dspUrl } = body;
      if (!deliveryId) return NextResponse.json({ error: 'deliveryId required' }, { status: 400 });

      await prisma.dSPDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'live',
          liveAt: new Date(),
          ...(dspReleaseId ? { dspReferenceId: dspReleaseId } : {}),
        },
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'process_queue') {
      const result = await processDistributionQueue();
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error('[admin/distribution] POST error:', err);
    const msg = err instanceof Error ? err.message : 'Action failed';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
