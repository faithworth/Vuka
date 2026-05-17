import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedDownloadUrl, r2Keys } from '@/lib/r2';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const purchase = await prisma.purchase.findUnique({
    where: { downloadToken: params.token },
    include: {
      beat: true,
      release: { include: { tracks: true } },
    },
  });

  if (!purchase) {
    return NextResponse.json({ error: 'Eish — invalid download token' }, { status: 404 });
  }
  if (purchase.status !== 'confirmed') {
    return NextResponse.json({ error: 'Payment not confirmed yet' }, { status: 402 });
  }
  // Token expiry: 30 days
  const expires = new Date(purchase.createdAt);
  expires.setDate(expires.getDate() + 30);
  if (new Date() > expires) {
    return NextResponse.json({ error: 'Download link expired — visit /redownload' }, { status: 410 });
  }
  // Max 10 session downloads (one session = one page visit, not one file)
  if (purchase.downloadCount >= 10) {
    return NextResponse.json({ error: 'Download limit reached — visit /redownload' }, { status: 429 });
  }

  // Increment count once per session visit (not per file)
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { downloadCount: { increment: 1 } },
  });

  // Build download URLs
  const downloads: Array<{ name: string; url: string }> = [];

  if (purchase.beat) {
    if (purchase.beat.fullWavUrl) {
      const key = r2Keys.beatFullWav(purchase.beat.id);
      downloads.push({ name: `${purchase.beat.title}.wav`, url: await getPresignedDownloadUrl(key) });
    }
    if (purchase.beat.fullMp3Url) {
      const key = r2Keys.beatFullMp3(purchase.beat.id);
      downloads.push({ name: `${purchase.beat.title}.mp3`, url: await getPresignedDownloadUrl(key) });
    }
    if (purchase.licenseUrl) {
      downloads.push({ name: `${purchase.beat.title}-License.pdf`, url: purchase.licenseUrl });
    }
  } else if (purchase.release) {
    for (const track of purchase.release.tracks) {
      const key = r2Keys.trackFull(track.id);
      downloads.push({
        name: `${track.trackNumber.toString().padStart(2, '0')} - ${track.title}.mp3`,
        url: await getPresignedDownloadUrl(key),
      });
    }
  }

  return NextResponse.json({
    downloads,
    itemName: purchase.beat?.title || purchase.release?.title || 'Your Purchase',
    downloadsLeft: 10 - (purchase.downloadCount + 1),
    licenseUrl: purchase.licenseUrl,
  });
}
