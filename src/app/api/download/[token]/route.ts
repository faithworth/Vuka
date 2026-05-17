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
    },
  });

  if (!purchase) return NextResponse.json({ error: 'Eish — invalid download token' }, { status: 404 });
  if (purchase.status !== 'confirmed') return NextResponse.json({ error: 'Payment not confirmed yet' }, { status: 402 });

  const expires = new Date(purchase.createdAt);
  expires.setDate(expires.getDate() + 30);
  if (new Date() > expires) return NextResponse.json({ error: 'Download link expired — visit /redownload' }, { status: 410 });

  if (purchase.downloadCount >= 10) return NextResponse.json({ error: 'Download limit reached — visit /redownload' }, { status: 429 });

  // Increment once per page visit
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { downloadCount: { increment: 1 } },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const base = `${appUrl}/api/download/${params.token}/file`;

  // Build download list — all route through /file/[index] so metadata gets embedded
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
      downloads.push({ name: `${purchase.beat.title}-License.pdf`, url: `${base}/${i}` });
    }
  } else if (purchase.release) {
    purchase.release.tracks.forEach((track, i) => {
      const filename = `${String(track.trackNumber).padStart(2, '0')} - ${track.title}.mp3`;
      downloads.push({ name: filename, url: `${base}/${i}` });
    });
  }

  return NextResponse.json({
    downloads,
    itemName: purchase.beat?.title || purchase.release?.title || 'Your Purchase',
    downloadsLeft: 10 - (purchase.downloadCount + 1),
    licenseUrl: purchase.licenseUrl,
  });
}
