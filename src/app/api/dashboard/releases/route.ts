// ============================================================
// PATCH 08 — src/app/api/dashboard/releases/route.ts
// REPLACE entire file.
// Adds DELETE method with guard (cannot delete if confirmed sales exist).
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Beat-store releases (Release model)
    const storeReleases = await prisma.release.findMany({
      where: { artistId: user.artist.id },
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ releases: storeReleases });
  } catch (err) {
    console.error('[releases] GET error:', err);
    return NextResponse.json({ releases: [], dbError: true });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { releaseId, isActive, title, price, minPrice, payWhatWant, description } = await req.json();
    const release = await prisma.release.findFirst({ where: { id: releaseId, artistId: user.artist.id } });
    if (!release) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.release.update({
      where: { id: releaseId },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(title && { title }),
        ...(price !== undefined && { price }),
        ...(minPrice !== undefined && { minPrice }),
        ...(payWhatWant !== undefined && { payWhatWant }),
        ...(description !== undefined && { description }),
      },
    });
    return NextResponse.json({ release: updated });
  } catch (err) {
    console.error('[releases] PATCH error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const releaseId = searchParams.get('releaseId');
    if (!releaseId) return NextResponse.json({ error: 'releaseId required' }, { status: 400 });

    const release = await prisma.release.findFirst({
      where: { id: releaseId, artistId: user.artist.id },
      include: { purchases: { where: { status: 'confirmed' } } },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    if (release.purchases.length > 0) {
      return NextResponse.json({
        error: `This release has ${release.purchases.length} confirmed sale(s). You can hide it but cannot delete it while buyers still have access.`,
      }, { status: 409 });
    }

    // Delete tracks first (FK constraint), then release
    await prisma.track.deleteMany({ where: { releaseId } });
    await prisma.release.delete({ where: { id: releaseId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[releases] DELETE error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
