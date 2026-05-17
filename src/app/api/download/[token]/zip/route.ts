import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { r2, r2Keys } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { zipSync } from 'fflate';
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
  { params }: { params: { token: string } }
) {
  const purchase = await prisma.purchase.findUnique({
    where: { downloadToken: params.token },
    include: {
      beat: { include: { artist: true } },
      release: { include: { tracks: true, artist: true } },
    },
  });

  if (!purchase) return NextResponse.json({ error: 'Invalid download token' }, { status: 404 });
  if (purchase.status !== 'confirmed') return NextResponse.json({ error: 'Payment not confirmed yet' }, { status: 402 });

  const expires = new Date(purchase.createdAt);
  expires.setDate(expires.getDate() + 30);
  if (new Date() > expires) return NextResponse.json({ error: 'Download link expired — visit /redownload' }, { status: 410 });
  if (purchase.downloadCount >= 10) return NextResponse.json({ error: 'Download limit reached — visit /redownload' }, { status: 429 });

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { downloadCount: { increment: 1 } },
  });

  const zipEntries: Record<string, Uint8Array> = {};
  const folderName = purchase.beat?.title || purchase.release?.title || 'Vuka-Purchase';

  if (purchase.beat) {
    const beat = purchase.beat;
    const artist = beat.artist;

    // Fetch artwork for embedding
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

    if (beat.fullWavUrl) {
      const raw = await fetchR2Buffer(r2Keys.beatFullWav(beat.id));
      if (raw) {
        const tagged = tagWav(raw, meta);
        zipEntries[`${folderName}/${beat.title}.wav`] = new Uint8Array(tagged);
      }
    }

    if (beat.fullMp3Url) {
      const raw = await fetchR2Buffer(r2Keys.beatFullMp3(beat.id));
      if (raw) {
        const tagged = tagMp3(raw, meta);
        zipEntries[`${folderName}/${beat.title}.mp3`] = new Uint8Array(tagged);
      }
    }

    // License PDF
    if (purchase.licenseUrl) {
      const buf = await fetchBuffer(purchase.licenseUrl);
      if (buf) zipEntries[`${folderName}/${beat.title}-License.pdf`] = new Uint8Array(buf);
    }

  } else if (purchase.release) {
    const release = purchase.release;
    const artist = release.artist;
    const totalTracks = release.tracks.length;
    const year = release.releaseDate
      ? new Date(release.releaseDate).getFullYear().toString()
      : new Date(release.createdAt).getFullYear().toString();

    // Fetch album artwork once
    const artworkBuf = await fetchR2Buffer(r2Keys.releaseArtwork(release.id))
      || (release.artworkUrl ? await fetchBuffer(release.artworkUrl) : null);

    for (const track of release.tracks) {
      const raw = await fetchR2Buffer(r2Keys.trackFull(track.id));
      if (!raw) continue;

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

      const tagged = tagMp3(raw, meta);
      const filename = `${String(track.trackNumber).padStart(2, '0')} - ${track.title}.mp3`;
      zipEntries[`${folderName}/${filename}`] = new Uint8Array(tagged);
    }
  }

  if (Object.keys(zipEntries).length === 0) {
    return NextResponse.json({ error: 'No files found' }, { status: 404 });
  }

  const zipped = zipSync(zipEntries, { level: 0 });

  return new NextResponse(zipped, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${folderName}.zip"`,
      'Content-Length': String(zipped.byteLength),
    },
  });
}
