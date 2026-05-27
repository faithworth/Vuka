// ============================================================
// PATCH 03 — src/app/api/download/[token]/route.ts
// REPLACE entire file.
// Fix: downloadCount is no longer incremented here (page visit).
//      It is now incremented in /api/download/[token]/file/[index]
//      only when a file is actually served. This prevents IDM or
//      page refreshes from burning the 10-download limit.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const purchase = await prisma.purchase.findUnique({
    where: { downloadToken: params.token },
    include: {
      beat: true,
      release: { include: { tracks: { orderBy: { trackNumber: 'asc' } } } },
      video: true,
      sample: true,
    },
  });

  if (!purchase) return NextResponse.json({ error: 'Invalid download link' }, { status: 404 });
  if (purchase.status !== 'confirmed') return NextResponse.json({ error: 'Payment not confirmed yet' }, { status: 402 });

  const expires = new Date(purchase.createdAt);
  expires.setDate(expires.getDate() + 30);
  if (new Date() > expires) return NextResponse.json({ error: 'Download link expired — visit /redownload to request a new one' }, { status: 410 });

  if (purchase.downloadCount >= 10) return NextResponse.json({ error: 'Download limit reached — visit /redownload' }, { status: 429 });

  // NOTE: downloadCount is NOT incremented here anymore.
  // It is incremented in /api/download/[token]/file/[index] per actual file served.

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const base = `${appUrl}/api/download/${params.token}/file`;

  const downloads: Array<{ name: string; url: string }> = [];

  if (purchase.beat) {
    let i = 0;
    if (purchase.beat.fullWavUrl) {
      downloads.push({ name: `${purchase.beat.title}.wav`, url: `${base}/${i++}` });
    }
    if (purchase.beat.fullMp3Url) {
      downloads.push({ name: `${purchase.beat.title}.mp3`, url: `${base}/${i++}` });
    }
    if (purchase.licenseUrl) {
      downloads.push({ name: `${purchase.beat.title} — License.pdf`, url: `${base}/${i}` });
    }
  } else if (purchase.release) {
    purchase.release.tracks.forEach((track: any, i: number) => {
      const filename = `${String(track.trackNumber).padStart(2, '0')} - ${track.title}.mp3`;
      downloads.push({ name: filename, url: `${base}/${i}` });
    });
  } else if (purchase.video) {
    downloads.push({ name: `${purchase.video.title}.mp4`, url: `${base}/0` });
  } else if (purchase.sample) {
    downloads.push({ name: `${purchase.sample.title}.zip`, url: `${base}/0` });
  }

  return NextResponse.json({
    downloads,
    itemName: purchase.beat?.title || purchase.release?.title || purchase.video?.title || purchase.sample?.title || 'Your Purchase',
    downloadsLeft: 10 - purchase.downloadCount,
    licenseUrl: purchase.licenseUrl,
    itemType: purchase.itemType,
  });
}
