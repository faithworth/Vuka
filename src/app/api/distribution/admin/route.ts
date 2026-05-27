// ============================================================
// PHASE 2 — src/app/api/distribution/admin/route.ts
// Admin: approve/reject releases, trigger delivery
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  advanceReleaseStatus,
  initiateDeliveryPipeline,
  retryFailedDeliveries,
  appendStatusHistory,
  DistributionStatus,
} from '@/lib/distribution';

// GET — list all releases pending review
export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'metadata_review';

    const releases = await prisma.distributionRelease.findMany({
      where: status === 'all' ? {} : { status },
      include: {
        artist: { select: { id: true, name: true, slug: true, isVerified: true } },
        tracks: { orderBy: { trackNumber: 'asc' } },
        dspDeliveries: true,
        _count: { select: { tracks: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return NextResponse.json({ releases });
  } catch (err) {
    console.error('[distribution/admin] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — admin action: approve, reject, deliver, retry
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { releaseId, action, notes } = await req.json();
    if (!releaseId || !action) {
      return NextResponse.json({ error: 'releaseId and action required' }, { status: 400 });
    }

    const release = await prisma.distributionRelease.findUnique({ where: { id: releaseId } });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    switch (action) {
      case 'approve_metadata': {
        if (release.status !== 'metadata_review') {
          return NextResponse.json({ error: 'Release is not in metadata review' }, { status: 409 });
        }
        await advanceReleaseStatus(releaseId, 'artwork_review', notes || 'Metadata approved');
        return NextResponse.json({ ok: true, status: 'artwork_review' });
      }

      case 'approve_artwork': {
        if (release.status !== 'artwork_review') {
          return NextResponse.json({ error: 'Release is not in artwork review' }, { status: 409 });
        }
        await prisma.distributionRelease.update({
          where: { id: releaseId },
          data: { artworkStatus: 'approved' },
        });
        await advanceReleaseStatus(releaseId, 'approved', notes || 'Artwork approved');
        return NextResponse.json({ ok: true, status: 'approved' });
      }

      case 'reject': {
        const history = appendStatusHistory(
          release.statusHistory as any[],
          'failed',
          notes || 'Rejected by admin'
        );
        await prisma.distributionRelease.update({
          where: { id: releaseId },
          data: {
            status: 'failed',
            statusHistory: history,
            adminNotes: notes || 'Rejected',
            artworkStatus: release.status === 'artwork_review' ? 'rejected' : release.artworkStatus,
          },
        });
        return NextResponse.json({ ok: true, status: 'failed' });
      }

      case 'deliver': {
        if (!['approved', 'scheduled'].includes(release.status)) {
          return NextResponse.json({ error: 'Release must be approved before delivery' }, { status: 409 });
        }
        const result = await initiateDeliveryPipeline(releaseId);
        if (!result.success) {
          return NextResponse.json({ error: result.errors.join('; ') }, { status: 422 });
        }
        return NextResponse.json({ ok: true, status: 'delivering', deliveries: result.deliveries });
      }

      case 'retry': {
        await retryFailedDeliveries(releaseId);
        return NextResponse.json({ ok: true, message: 'Retry initiated for failed DSP deliveries' });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[distribution/admin] POST error:', err?.message);
    return NextResponse.json({ error: 'Action failed' }, { status: 503 });
  }
}
