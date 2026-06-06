// ============================================================
// VUKA — src/app/api/distribution/releases/[id]/route.ts
// GET a single distribution release (for the edit audio page)
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const release = await prisma.distributionRelease.findFirst({
      where: { id: params.id, artistId: user.artist.id },
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
    });

    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    return NextResponse.json({ release });
  } catch (err) {
    console.error('[distribution/releases/[id]] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
