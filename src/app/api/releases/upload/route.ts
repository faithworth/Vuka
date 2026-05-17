export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedUploadUrl, getPublicUrl, r2Keys } from '@/lib/r2';
import { requireArtist } from '@/lib/auth';
import { slugify } from '@/lib/utils';

// POST: create release + track records, return presigned R2 PUT URLs for direct browser upload
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { title, releaseType, price, minPrice, payWhatWant, description, credits, releaseDate, tracks } = body;

    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!tracks?.length) return NextResponse.json({ error: 'At least one track required' }, { status: 400 });

    // Generate unique slug
    let slug = slugify(title);
    let suffix = 0;
    while (await prisma.release.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(title)}-${suffix}`;
    }

    const release = await prisma.release.create({
      data: {
        artistId: user.artist.id,
        title,
        slug,
        releaseType: releaseType || 'single',
        price: parseFloat(price) || 0,
        minPrice: parseFloat(minPrice) || 0,
        payWhatWant: !!payWhatWant,
        description: description || '',
        credits: credits || '',
        releaseDate: releaseDate ? new Date(releaseDate) : undefined,
        isActive: false,
      },
    });

    // Create track records
    const trackRecords = await Promise.all(
      (tracks as { title: string; trackNumber: number }[]).map((t, i) =>
        prisma.track.create({
          data: {
            releaseId: release.id,
            title: t.title || `Track ${i + 1}`,
            trackNumber: t.trackNumber || i + 1,
            previewUrl: '',
            fullUrl: '',
          },
        })
      )
    );

    // Generate presigned PUT URLs — browser uploads directly to R2
    const uploadUrls: Record<string, string> = {};
    const publicUrls: Record<string, string> = {};

    const artworkKey = r2Keys.releaseArtwork(release.id);
    uploadUrls.artwork = await getPresignedUploadUrl(artworkKey, 'image/jpeg');
    publicUrls.artworkUrl = getPublicUrl(artworkKey);

    for (const track of trackRecords) {
      const previewKey = r2Keys.trackPreview(track.id);
      const fullKey = r2Keys.trackFull(track.id);
      uploadUrls[`preview_${track.id}`] = await getPresignedUploadUrl(previewKey, 'audio/mpeg');
      uploadUrls[`full_${track.id}`] = await getPresignedUploadUrl(fullKey, 'audio/mpeg');
      publicUrls[`previewUrl_${track.id}`] = getPublicUrl(previewKey);
      publicUrls[`fullUrl_${track.id}`] = getPublicUrl(fullKey);
    }

    return NextResponse.json({ release, tracks: trackRecords, uploadUrls, publicUrls });
  } catch (err: any) {
    console.error('[releases/upload] POST error:', err?.message || err);
    return NextResponse.json(
      { error: 'Release setup failed — check R2 credentials and database connection', detail: err?.message },
      { status: 503 }
    );
  }
}

// PATCH: activate release after all direct-to-R2 uploads complete
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { releaseId, artworkUrl, trackUpdates } = await req.json();

    if (!releaseId) return NextResponse.json({ error: 'releaseId required' }, { status: 400 });

    const release = await prisma.release.findFirst({
      where: { id: releaseId, artistId: user.artist.id },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    await prisma.release.update({
      where: { id: releaseId },
      data: {
        artworkUrl: artworkUrl || release.artworkUrl,
        isActive: true,
      },
    });

    if (trackUpdates) {
      for (const [trackId, urls] of Object.entries(
        trackUpdates as Record<string, { previewUrl: string; fullUrl: string; duration?: number }>
      )) {
        await prisma.track.update({
          where: { id: trackId },
          data: {
            previewUrl: urls.previewUrl || '',
            fullUrl: urls.fullUrl || '',
            duration: urls.duration || 0,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[releases/upload] PATCH error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to activate release', detail: err?.message }, { status: 503 });
  }
}
