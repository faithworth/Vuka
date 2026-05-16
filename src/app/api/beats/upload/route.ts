export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedUploadUrl, r2Keys } from '@/lib/r2';
import { requireArtist } from '@/lib/auth';
import { slugify } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      title, bpm, keySignature, genre, mood, tags,
      basicPrice, premiumPrice, exclPrice,
      hasWav, hasMp3,
    } = body;

    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    // Generate unique slug
    let slug = slugify(title);
    let suffix = 0;
    while (await prisma.beat.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(title)}-${suffix}`;
    }

    const beat = await prisma.beat.create({
      data: {
        artistId: user.artist.id,
        title,
        slug,
        bpm: parseInt(bpm) || 0,
        keySignature: keySignature || '',
        genre: genre || '',
        mood: mood || '',
        tags: tags || [],
        basicPrice: parseFloat(basicPrice) || 0,
        premiumPrice: parseFloat(premiumPrice) || 0,
        exclPrice: parseFloat(exclPrice) || 0,
        previewUrl: '',
        fullWavUrl: '',
        fullMp3Url: '',
        isActive: false, // activate after files upload
      },
    });

    // Generate presigned upload URLs
    const urls: Record<string, string> = {};
    urls.artwork = await getPresignedUploadUrl(r2Keys.beatArtwork(beat.id), 'image/jpeg');
    urls.preview = await getPresignedUploadUrl(r2Keys.beatPreview(beat.id), 'audio/mpeg');
    if (hasWav) urls.wav = await getPresignedUploadUrl(r2Keys.beatFullWav(beat.id), 'audio/wav');
    if (hasMp3) urls.mp3 = await getPresignedUploadUrl(r2Keys.beatFullMp3(beat.id), 'audio/mpeg');

    return NextResponse.json({ beat, uploadUrls: urls });
  } catch (err) {
    console.error('[upload] POST error:', err);
    return NextResponse.json({ error: 'Upload failed — check database connection and R2 credentials' }, { status: 503 });
  }
}

// PATCH: finalise beat after files uploaded
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { beatId, artworkUrl, previewUrl, fullWavUrl, fullMp3Url, waveformData } = await req.json();

    const beat = await prisma.beat.findFirst({
      where: { id: beatId, artistId: user.artist.id },
    });
    if (!beat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await prisma.beat.update({
      where: { id: beatId },
      data: {
        artworkUrl: artworkUrl || beat.artworkUrl,
        previewUrl: previewUrl || beat.previewUrl,
        fullWavUrl: fullWavUrl || beat.fullWavUrl,
        fullMp3Url: fullMp3Url || beat.fullMp3Url,
        waveformData: waveformData || beat.waveformData,
        isActive: !!(previewUrl || beat.previewUrl),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[upload] PATCH error:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}

