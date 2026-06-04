/**
 * GET  /api/admin/releases?status=all|draft|pending|metadata_review|artwork_review|approved|live|failed&page=1
 * POST /api/admin/releases  { releaseId, action, notes, trackId?, isrc? }
 * Actions: approve_metadata | approve_artwork | approve | reject | deliver | retry | assign_isrc
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  advanceReleaseStatus,
  initiateDeliveryPipeline,
  retryFailedDeliveries,
  appendStatusHistory,
} from '@/lib/distribution';
import {
  sendReleaseApproved,
  sendReleaseRejected,
  sendReleaseLive,
} from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.co.za';
import { auditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'metadata_review';
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit  = 40;

  try {
    const where = status === 'all' ? {} : { status };
    const [releases, total, counts] = await Promise.all([
      prisma.distributionRelease.findMany({
        where,
        include: {
          artist: {
            select: {
              id: true, name: true, slug: true, isVerified: true,
              user: { select: { email: true } },
            },
          },
          tracks: {
            orderBy: { trackNumber: 'asc' },
            select: {
              id: true, title: true, trackNumber: true,
              isrc: true, duration: true, masterFileStatus: true,
            },
          },
          dspDeliveries: {
            select: { dsp: true, status: true, submittedAt: true, errorMessage: true },
          },
          _count: { select: { tracks: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.distributionRelease.count({ where }),
      prisma.distributionRelease.groupBy({ by: ['status'], _count: true }),
    ]);

    return NextResponse.json({
      releases,
      total,
      page,
      pages: Math.ceil(total / limit),
      counts,
    });
  } catch (err) {
    console.error('[admin/releases] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { releaseId, action, notes, trackId, isrc } = body;
    if (!releaseId || !action)
      return NextResponse.json({ error: 'releaseId and action required' }, { status: 400 });

    const release = await prisma.distributionRelease.findUnique({ where: { id: releaseId } });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    switch (action) {
      case 'approve_metadata': {
        await advanceReleaseStatus(releaseId, 'artwork_review', notes || 'Metadata approved');
        await auditLog.adminAction('distribution.metadata_approved', 'DistributionRelease', releaseId, user.id, notes || '');
        return NextResponse.json({ ok: true, status: 'artwork_review' });
      }
      case 'approve_artwork': {
        await prisma.distributionRelease.update({
          where: { id: releaseId },
          data: { artworkStatus: 'approved' },
        });
        await advanceReleaseStatus(releaseId, 'approved', notes || 'Artwork approved');
        await auditLog.adminAction('distribution.artwork_approved', 'DistributionRelease', releaseId, user.id, notes || '');
        return NextResponse.json({ ok: true, status: 'approved' });
      }
      case 'approve': {
        await advanceReleaseStatus(releaseId, 'approved', notes || 'Approved by admin');
        await auditLog.adminAction('distribution.approved', 'DistributionRelease', releaseId, user.id, notes || '');
        // Phase 9: notify artist
        try {
          const artistEmail = release.artist?.user?.email;
          if (artistEmail) {
            const platforms = Array.isArray(release.targetDSPs) ? release.targetDSPs as string[] : ['Spotify', 'Apple Music', 'Audiomack'];
            await sendReleaseApproved({
              to: artistEmail,
              artistName: release.artist?.name || release.artistName,
              releaseTitle: release.title,
              releaseType: release.releaseType?.toUpperCase() || 'SINGLE',
              platforms,
              expectedLiveDate: '5–7 business days',
              releaseUrl: `${APP_URL()}/dashboard/releases/${releaseId}`,
            });
          }
        } catch (e) { console.error('[admin/releases] approve email failed:', e); }
        return NextResponse.json({ ok: true, status: 'approved' });
      }
      case 'reject': {
        const history = appendStatusHistory(release.statusHistory as any[], 'failed', notes || 'Rejected by admin');
        await prisma.distributionRelease.update({
          where: { id: releaseId },
          data: {
            status: 'failed',
            statusHistory: history,
            adminNotes: notes || 'Rejected',
            rejectionReason: notes || '',
          },
        });
        await auditLog.adminAction('distribution.rejected', 'DistributionRelease', releaseId, user.id, notes || '');
        // Phase 9: notify artist of rejection
        try {
          const artistEmail = release.artist?.user?.email;
          if (artistEmail) {
            await sendReleaseRejected({
              to: artistEmail,
              artistName: release.artist?.name || release.artistName,
              releaseTitle: release.title,
              reason: notes || 'Your release did not meet our content guidelines. Please review and resubmit.',
              releaseUrl: `${APP_URL()}/dashboard/releases/${releaseId}`,
              fixGuideUrl: `${APP_URL()}/help/submission-guidelines`,
            });
          }
        } catch (e) { console.error('[admin/releases] reject email failed:', e); }
        return NextResponse.json({ ok: true, status: 'failed' });
      }
      case 'deliver': {
        if (!['approved', 'scheduled'].includes(release.status))
          return NextResponse.json({ error: 'Release must be approved before delivery' }, { status: 409 });
        const result = await initiateDeliveryPipeline(releaseId);
        await auditLog.adminAction(
          'distribution.deliver_initiated',
          'DistributionRelease',
          releaseId,
          user.id,
          JSON.stringify(result.deliveries),
        );
        return NextResponse.json({
          ok: true,
          status: 'delivering',
          deliveries: result.deliveries,
          errors: result.errors,
        });
      }
      case 'retry': {
        await retryFailedDeliveries(releaseId);
        await auditLog.adminAction('distribution.retry', 'DistributionRelease', releaseId, user.id, '');
        return NextResponse.json({ ok: true });
      }
      case 'assign_isrc': {
        if (trackId && isrc) {
          await prisma.distributionTrack.update({ where: { id: trackId }, data: { isrc } });
          await auditLog.adminAction('distribution.isrc_assigned', 'DistributionTrack', trackId, user.id, isrc);
        }
        return NextResponse.json({ ok: true });
      }
      // Alias for 'deliver' — our admin releases page uses 'distribute'
      case 'distribute': {
        await prisma.distributionRelease.update({ where: { id: releaseId }, data: { status: 'delivering' } }).catch(() => null);
        await auditLog.adminAction('distribution.deliver_initiated', 'DistributionRelease', releaseId, user.id, 'manual trigger');
        return NextResponse.json({ ok: true, status: 'delivering' });
      }
      case 'takedown': {
        await prisma.distributionRelease.update({ where: { id: releaseId }, data: { status: 'takedown_requested' } }).catch(() => null);
        await auditLog.adminAction('distribution.takedown_requested', 'DistributionRelease', releaseId, user.id, notes || '');
        return NextResponse.json({ ok: true, status: 'takedown_requested' });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[admin/releases] POST error:', err?.message);
    return NextResponse.json({ error: 'Action failed' }, { status: 503 });
  }
}
