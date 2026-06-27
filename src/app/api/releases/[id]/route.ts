// src/app/api/releases/[id]/route.ts
// Lightweight single-release fetch for the edit page. Metadata updates,
// publish/unpublish, and delete already have a working home at
// /api/dashboard/releases (PATCH/DELETE) — this route only adds the GET
// that was missing, so the edit page doesn't have to fetch the artist's
// entire release list just to load one.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireArtist } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const release = await prisma.release.findFirst({
      where: { id: params.id, artistId: user.artist.id },
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    return NextResponse.json({ release });
  } catch (err: any) {
    console.error('[releases/[id]] GET error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to load release' }, { status: 500 });
  }
}
