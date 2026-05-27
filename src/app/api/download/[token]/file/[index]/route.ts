// ============================================================
// PATCH 04 — src/app/api/download/[token]/file/[index]/route.ts
// REPLACE entire file.
// Fixes:
//   - downloadCount incremented HERE (actual file fetch), not on page visit
//   - Uses chunked streaming via ReadableStream so IDM never gets a
//     seekable/resumable full-file URL (no Content-Length, no Accept-Ranges)
//   - Supports video and sample pack item types
//   - Content-Disposition: inline for PDFs (view in browser, not download)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { r2, r2Keys } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { tagMp3, tagWav, fetchBuffer, TrackMeta } from '@/lib/metadata';

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vuka-audio';

async function streamR2Object(key: string): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const res = await r2.send(cmd);
    return res.Body as ReadableStream<Uint8Array>;
  } catch {
    return null;
  }
}

async function fetchR2Buffer(key: string): Promise<Buffer | null> {
  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
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
      video: { include: { artist: true } },
      sample: { include: { artist: true } },
    },
  });

  if (!purchase) return new NextResponse('Not found', { status: 404 });
  if (purchase.status !== 'confirmed') return new NextResponse('Payment not confirmed', { status: 402 });

  const expires = new Date(purchase.createdAt);
  expires.setDate(expires.getDate() + 30);
  if (new Date() > expires) return new NextResponse('Link expired', { status: 410 });

  if (purchase.downloadCount >= 10) return new NextResponse('Download limit reached', { status: 429 });

  // Increment BEFORE serving — prevents double-fetch exploitation
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { downloadCount: { increment: 1 } },
  });

  // ── BEAT ──────────────────────────────────────────────────
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
        `Buyer: ${purchase.buyerName}`,
        `License: ${purchase.licenseType || 'standard'}`,
      ].filter(Boolean).join(' | '),
      artworkBuffer: artworkBuf || undefined,
    };

    const hasWav = !!beat.fullWavUrl;

    // idx 0 = WAV (if exists), 1 = MP3, 2 = License PDF
    if (idx === 0 && hasWav) {
      const raw = await fetchR2Buffer(r2Keys.beatFullWav(beat.id));
      if (!raw) return new NextResponse('File not found', { status: 404 });
      const tagged = tagWav(raw, meta);
      return streamResponse(tagged, `${beat.title}.wav`, 'audio/wav');
    } else if ((idx === 1 && hasWav) || (idx === 0 && !hasWav)) {
      const raw = await fetchR2Buffer(r2Keys.beatFullMp3(beat.id));
      if (!raw) return new NextResponse('File not found', { status: 404 });
      const tagged = tagMp3(raw, meta);
      return streamResponse(tagged, `${beat.title}.mp3`, 'audio/mpeg');
    } else if (purchase.licenseUrl) {
      const buf = await fetchBuffer(purchase.licenseUrl);
      if (!buf) return new NextResponse('File not found', { status: 404 });
      return streamResponse(buf, `${beat.title} — License.pdf`, 'application/pdf', 'inline');
    }
  }

  // ── RELEASE ───────────────────────────────────────────────
  if (purchase.release) {
    const release = purchase.release;
    const artist = release.artist;
    const tracks = release.tracks;
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
      totalTracks: tracks.length,
      year,
      comment: release.credits ? `Credits: ${release.credits}` : undefined,
      artworkBuffer: artworkBuf || undefined,
    };

    const isWav = track.fullUrl?.endsWith('.wav') || false;
    const raw = isWav
      ? await fetchR2Buffer(r2Keys.trackFullWav(track.id))
      : await fetchR2Buffer(r2Keys.trackFull(track.id));
    if (!raw) return new NextResponse('File not found', { status: 404 });

    const trackNum = String(track.trackNumber).padStart(2, '0');
    if (isWav) {
      return streamResponse(tagWav(raw, meta), `${trackNum} - ${track.title}.wav`, 'audio/wav');
    } else {
      return streamResponse(tagMp3(raw, meta), `${trackNum} - ${track.title}.mp3`, 'audio/mpeg');
    }
  }

  // ── VIDEO ─────────────────────────────────────────────────
  if (purchase.video) {
    const video = purchase.video;
    const key = `private/videos/${video.id}.mp4`;
    const stream = await streamR2Object(key);
    if (!stream) return new NextResponse('File not found', { status: 404 });
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${video.title}.mp4"`,
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-store, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  // ── SAMPLE PACK ───────────────────────────────────────────
  if (purchase.sample) {
    const sample = purchase.sample;
    const key = `private/samples/${sample.id}.zip`;
    const stream = await streamR2Object(key);
    if (!stream) return new NextResponse('File not found', { status: 404 });
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${sample.title}.zip"`,
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-store, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return new NextResponse('File not found', { status: 404 });
}

// Chunked stream response — no Content-Length, no Accept-Ranges.
// IDM requires a seekable/resumable URL. This prevents it.
function streamResponse(
  buffer: Buffer,
  filename: string,
  contentType: string,
  disposition: 'attachment' | 'inline' = 'attachment'
): NextResponse {
  const CHUNK_SIZE = 64 * 1024; // 64 KB chunks
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= buffer.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + CHUNK_SIZE, buffer.length);
      controller.enqueue(new Uint8Array(buffer.subarray(offset, end)));
      offset = end;
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // Intentionally no Content-Length and no Accept-Ranges
    },
  });
}
