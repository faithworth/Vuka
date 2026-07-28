export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedUploadUrl, r2Keys } from '@/lib/r2';
import { requireArtist } from '@/lib/auth';

// POST /api/v2/beat-bundle
// Creates a BeatBundle record + returns a presigned R2 upload URL for the
// source WAV, same direct-to-R2 pattern as /api/beats/upload.
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const title = (body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    const variantCount = Math.min(Math.max(parseInt(body.variantCount) || 50, 1), 50);

    const bundle = await prisma.beatBundle.create({
      data: {
        artistId: user.artist.id,
        title,
        variantCount,
        status: 'pending',
      },
    });

    const sourceKey = r2Keys.beatBundleSource(bundle.id);
    const uploadUrl = await getPresignedUploadUrl(sourceKey, 'audio/wav');

    return NextResponse.json({ bundle, uploadUrl });
  } catch (err: any) {
    console.error('[v2/beat-bundle] POST error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to create bundle', detail: err?.message }, { status: 503 });
  }
}

// GET /api/v2/beat-bundle — list the current artist's bundles, newest first
export async function GET(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const bundles = await prisma.beatBundle.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ bundles });
  } catch (err: any) {
    console.error('[v2/beat-bundle] GET error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to load bundles' }, { status: 503 });
  }
}
