// ============================================================
// PHASE 2 — src/app/api/distribution/releases/[id]/tracks/route.ts
// Manage tracks on a distribution release
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateISRC, getPresignedUploadUrl, r2Keys } from '@/lib/distribution';
import { getPresignedUploadUrl as getR2UploadUrl } from '@/lib/r2';

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

    return NextResponse.json({ tracks: release.tracks });
  } catch (err) {
    console.error('[distribution/tracks] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const release = await prisma.distributionRelease.findFirst({
      where: { id: params.id, artistId: user.artist.id },
      include: { _count: { select: { tracks: true } } },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    if (!['draft', 'metadata_review', 'failed'].includes(release.status)) {
      return NextResponse.json({ error: 'Cannot add tracks to this release' }, { status: 409 });
    }

    const body = await req.json();
    const { title, trackNumber, featuredArtists, composers, lyricists, producers, explicit, language } = body;

    if (!title?.trim()) return NextResponse.json({ error: 'Track title required' }, { status: 400 });

    const isrc = generateISRC();
    const tNum = trackNumber || (release._count.tracks + 1);

    // Generate presigned upload URL for master file
    const masterKey = `distribution/${release.id}/tracks/${Date.now()}.wav`;
    const uploadUrl = await getR2UploadUrl(masterKey, 'audio/wav');

    const track = await prisma.distributionTrack.create({
      data: {
        distributionReleaseId: params.id,
        trackNumber: tNum,
        title: title.trim(),
        featuredArtists: featuredArtists || [],
        isrc,
        composers: composers || [],
        lyricists: lyricists || [],
        producers: producers || [],
        explicit: explicit || false,
        language: language || 'en',
        masterFileUrl: masterKey,
        masterFileStatus: 'pending',
      },
    });

    return NextResponse.json({ track, uploadUrl, masterKey }, { status: 201 });
  } catch (err: any) {
    console.error('[distribution/tracks] POST error:', err?.message);
    return NextResponse.json({ error: 'Failed to create track' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get('trackId');
    if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 });

    const release = await prisma.distributionRelease.findFirst({
      where: { id: params.id, artistId: user.artist.id },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
    if (!['draft', 'metadata_review', 'failed'].includes(release.status)) {
      return NextResponse.json({ error: 'Cannot delete tracks from this release' }, { status: 409 });
    }

    await prisma.distributionTrack.delete({ where: { id: trackId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[distribution/tracks] DELETE error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 503 });
  }
}
