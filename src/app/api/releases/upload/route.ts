import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedUploadUrl, r2Keys } from '@/lib/r2';
import { requireArtist } from '@/lib/auth';
import { slugify } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { title, releaseType, price, minPrice, payWhatWant, description, credits, releaseDate, tracks } = body;

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

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
    (tracks || []).map(async (t: { title: string; trackNumber: number }, i: number) => {
      return prisma.track.create({
        data: {
          releaseId: release.id,
          title: t.title || `Track ${i + 1}`,
          trackNumber: t.trackNumber || i + 1,
          previewUrl: '',
          fullUrl: '',
        },
      });
    })
  );

  // Presigned URLs
  const uploadUrls: Record<string, string> = {};
  uploadUrls.artwork = await getPresignedUploadUrl(r2Keys.releaseArtwork(release.id), 'image/jpeg');

  for (const track of trackRecords) {
    uploadUrls[`preview_${track.id}`] = await getPresignedUploadUrl(r2Keys.trackPreview(track.id), 'audio/mpeg');
    uploadUrls[`full_${track.id}`] = await getPresignedUploadUrl(r2Keys.trackFull(track.id), 'audio/mpeg');
  }

  return NextResponse.json({ release, tracks: trackRecords, uploadUrls });
}

export async function PATCH(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { releaseId, artworkUrl, trackUpdates } = await req.json();

  const release = await prisma.release.findFirst({
    where: { id: releaseId, artistId: user.artist.id },
  });
  if (!release) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.release.update({
    where: { id: releaseId },
    data: { artworkUrl: artworkUrl || release.artworkUrl, isActive: true },
  });

  if (trackUpdates) {
    for (const [trackId, urls] of Object.entries(trackUpdates as Record<string, { previewUrl: string; fullUrl: string; duration?: number }>)) {
      await prisma.track.update({
        where: { id: trackId },
        data: { previewUrl: urls.previewUrl, fullUrl: urls.fullUrl, duration: urls.duration || 0 },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
