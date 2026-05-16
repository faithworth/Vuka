export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const releases = await prisma.release.findMany({
      where: { artistId: user.artist.id },
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ releases });
  } catch (err) {
    console.error('[releases] GET error:', err);
    return NextResponse.json({ releases: [], dbError: true });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { releaseId, isActive, title, price, minPrice, description } = await req.json();
    const release = await prisma.release.findFirst({ where: { id: releaseId, artistId: user.artist.id } });
    if (!release) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.release.update({
      where: { id: releaseId },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(title && { title }),
        ...(price !== undefined && { price }),
        ...(minPrice !== undefined && { minPrice }),
        ...(description !== undefined && { description }),
      },
    });
    return NextResponse.json({ release: updated });
  } catch (err) {
    console.error('[releases] PATCH error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
