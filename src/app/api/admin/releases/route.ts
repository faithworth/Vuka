/**
 * GET  /api/admin/releases?status=all|active|inactive&page=1&search=
 * POST /api/admin/releases  { releaseId, action, notes }
 * Actions: activate | deactivate | delete
 *
 * Vuka Music publishes releases instantly when the artist hits "Publish" — there
 * is no pre-publish review queue and no DSP delivery. This endpoint is
 * purely for post-publish moderation: pulling a release from the store
 * (deactivate), restoring it (activate), or removing one that never sold
 * anything (delete).
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sendReleaseTakenDown } from '@/lib/emails';
import { auditLog } from '@/lib/audit';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'all'; // all | active | inactive
  const search = (searchParams.get('search') || '').trim();
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit  = 40;

  try {
    const where: any = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [releases, total, activeCount, inactiveCount] = await Promise.all([
      prisma.release.findMany({
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
            select: { id: true, title: true, trackNumber: true, duration: true },
          },
          _count: { select: { tracks: true, purchases: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.release.count({ where }),
      prisma.release.count({ where: { isActive: true } }),
      prisma.release.count({ where: { isActive: false } }),
    ]);

    return NextResponse.json({
      releases,
      total,
      page,
      pages: Math.ceil(total / limit),
      counts: { all: activeCount + inactiveCount, active: activeCount, inactive: inactiveCount },
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
    const { releaseId, action, notes } = body;
    if (!releaseId || !action)
      return NextResponse.json({ error: 'releaseId and action required' }, { status: 400 });

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      include: { artist: { include: { user: { select: { email: true } } } } },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    switch (action) {
      case 'activate': {
        await prisma.release.update({ where: { id: releaseId }, data: { isActive: true } });
        await auditLog.adminAction('release.activated', 'Release', releaseId, user.id, notes || '');
        return NextResponse.json({ ok: true, isActive: true });
      }

      case 'deactivate': {
        if (!notes?.trim()) {
          return NextResponse.json({ error: 'A reason is required to unpublish a release' }, { status: 400 });
        }
        await prisma.release.update({ where: { id: releaseId }, data: { isActive: false } });
        await auditLog.adminAction('release.deactivated', 'Release', releaseId, user.id, notes);

        try {
          const artistEmail = release.artist?.user?.email;
          if (artistEmail) {
            await sendReleaseTakenDown({
              to: artistEmail,
              artistName: release.artist?.name || 'Artist',
              releaseTitle: release.title,
              reason: notes,
              releaseUrl: `${APP_URL()}/dashboard/releases/${releaseId}/edit`,
            });
          }
        } catch (e) {
          console.error('[admin/releases] takedown email failed:', e);
        }
        return NextResponse.json({ ok: true, isActive: false });
      }

      case 'delete': {
        if (release.sales > 0) {
          return NextResponse.json({
            error: 'This release has sales on record and can\'t be deleted. Deactivate it instead.',
          }, { status: 409 });
        }
        await prisma.$transaction([
          prisma.track.deleteMany({ where: { releaseId } }),
          prisma.release.delete({ where: { id: releaseId } }),
        ]);
        await auditLog.adminAction('release.deleted', 'Release', releaseId, user.id, notes || '');
        return NextResponse.json({ ok: true, deleted: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[admin/releases] POST error:', err?.message);
    return NextResponse.json({ error: 'Action failed' }, { status: 503 });
  }
}
