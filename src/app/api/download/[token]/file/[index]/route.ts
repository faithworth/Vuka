import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { r2, r2Keys } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { tagMp3, tagWav, fetchBuffer, TrackMeta } from '@/lib/metadata';

async function fetchR2Buffer(key: string): Promise<Buffer | null> {
  try {
    const cmd = new GetObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vuka-audio',
      Key: key,
    });
    const res = await r2.send(cmd);
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; index: string } }
) {
  const idx = parseInt(params.index);

  const purchase = await prisma.purchase.findUnique({
    where: { downloadToken: params.token },
    include: {
      beat: { include: { artist: true } },
      release: { include: { tracks: { orderBy: { trackNumber: 'asc' } }, artist: true } },
    },
  });

  if (!purchase) return new NextResponse('Not found', { status: 404 });
  if (purchase.status !== 'confirmed') return new NextResponse('Payment not confirmed', { status: 402 });

  const expires = new Date(purchase.createdAt);
  expires.setDate(expires.getDate() + 30);
  if (new Date() > expires) return new NextResponse('Link expired', { status: 410 });

  let fileBuffer: Buffer | null = null;
  let filename = 'download';
  let contentType = 'application/octet-stream';

  if (purchase.beat) {
    const beat = purchase.beat;
    const artist = beat.artist;
    const artworkBuf = await fetchR2Buffer(r2Keys.beatArtwork(beat.id))
      || (beat.artworkUrl ? await fetchBuffer(beat.artworkUrl) : null);

    const meta: TrackMeta = {
      title: beat.title,
      artist: artist.name,
      album: beat.title,
      year: new Date(beat.createdAt).getFullYear().toString(),
      genre: beat.genre || undefined,
      bpm: beat.bpm || undefined,
      key: beat.keySignature || undefined,
      comment: [
        beat.mood ? `Mood: ${beat.mood}` : '',
        beat.tags?.length ? `Tags: ${beat.tags.join(', ')}` : '',
        `Purchased by: ${purchase.buyerName}`,
        `License: ${purchase.licenseType || 'standard'}`,
      ].filter(Boolean).join(' | '),
      artworkBuffer: artworkBuf || undefined,
    };

    // idx 0 = WAV (if exists), 1 = MP3, 2 = License PDF
    const hasWav = !!beat.fullWavUrl;
    if (idx === 0 && hasWav) {
      const raw = await fetchR2Buffer(r2Keys.beatFullWav(beat.id));
      if (raw) { fileBuffer = tagWav(raw, meta); filename = `${beat.title}.wav`; contentType = 'audio/wav'; }
    } else if ((idx === 1 && hasWav) || (idx === 0 && !hasWav)) {
      const raw = await fetchR2Buffer(r2Keys.beatFullMp3(beat.id));
      if (raw) { fileBuffer = tagMp3(raw, meta); filename = `${beat.title}.mp3`; contentType = 'audio/mpeg'; }
    } else if (purchase.licenseUrl) {
      const buf = await fetchBuffer(purchase.licenseUrl);
      if (buf) { fileBuffer = buf; filename = `${beat.title}-License.pdf`; contentType = 'application/pdf'; }
    }

  } else if (purchase.release) {
    const release = purchase.release;
    const artist = release.artist;
    const tracks = release.tracks;
    const totalTracks = tracks.length;
    const year = release.releaseDate
      ? new Date(release.releaseDate).getFullYear().toString()
      : new Date(release.createdAt).getFullYear().toString();

    const track = tracks[idx];
    if (!track) return new NextResponse('Track not found', { status: 404 });

    const artworkBuf = await fetchR2Buffer(r2Keys.releaseArtwork(release.id))
      || (release.artworkUrl ? await fetchBuffer(release.artworkUrl) : null);

    const meta: TrackMeta = {
      title: track.title,
      artist: artist.name,
      albumArtist: artist.name,
      album: release.title,
      trackNumber: track.trackNumber,
      totalTracks,
      year,
      comment: release.credits ? `Credits: ${release.credits}` : undefined,
      artworkBuffer: artworkBuf || undefined,
    };

    const raw = await fetchR2Buffer(r2Keys.trackFull(track.id));
    if (raw) {
      fileBuffer = tagMp3(raw, meta);
      filename = `${String(track.trackNumber).padStart(2, '0')} - ${track.title}.mp3`;
      contentType = 'audio/mpeg';
    }
  }

  if (!fileBuffer) return new NextResponse('File not found', { status: 404 });

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(fileBuffer.length),
    },
  });
}
