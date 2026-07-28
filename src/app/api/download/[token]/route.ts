
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
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const purchase = await prisma.purchase.findUnique({
    where: { downloadToken: token },
    include: {
      beat: { include: { artist: true } },
      release: { include: { tracks: { orderBy: { trackNumber: 'asc' } } } },
      distributionRelease: { include: { tracks: { orderBy: { trackNumber: 'asc' } } } },
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

  const beatLicense = purchase.itemType === 'beat'
    ? await prisma.beatLicense.findUnique({ where: { purchaseId: purchase.id }, select: { licenseKey: true } }).catch(() => null)
    : null;

  // Self-heal: license PDF generation can fail in the payment webhook
  // (after the purchase is already claimed 'confirmed', with no retry
  // path), leaving licenseUrl permanently null. Rather than silently
  // omitting the license, generate it now on first page load and
  // persist it so this only ever happens once per purchase.
  let licenseUrl = purchase.licenseUrl;
  if (purchase.beat && !licenseUrl) {
    try {
      const pdfBuffer = await generateLicensePDF({
        licenseId: purchase.licenseId,
        licenseType: purchase.licenseType || 'standard',
        beatTitle: purchase.beat.title,
        artistName: purchase.beat.artist?.name || '',
        buyerName: purchase.buyerName,
        buyerEmail: purchase.buyerEmail,
        amount: purchase.amount,
        currency: purchase.currency,
        date: purchase.createdAt,
        itemKind: 'beat',
      });
      const pdfKey = r2Keys.license(purchase.licenseId);
      await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
      licenseUrl = getPublicUrl(pdfKey);
      await prisma.purchase.update({ where: { id: purchase.id }, data: { licenseUrl } });
    } catch (e) {
      console.error('[download] lazy license generation failed', purchase.id, e);
    }
  }

  // NOTE: downloadCount is NOT incremented here anymore.
  // It is incremented in /api/download/[token]/file/[index] per actual file served.

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const base = `${appUrl}/api/download/${token}/file`;

  const downloads: Array<{ name: string; url: string }> = [];

  if (purchase.beat) {
    let i = 0;
    if (purchase.beat.fullWavUrl) {
      downloads.push({ name: `${purchase.beat.title}.wav`, url: `${base}/${i++}` });
    }
    if (purchase.beat.fullMp3Url) {
      downloads.push({ name: `${purchase.beat.title}.mp3`, url: `${base}/${i++}` });
    }
    if (licenseUrl) {
      downloads.push({ name: `${purchase.beat.title} — License.pdf`, url: `${base}/${i}` });
    }
  } else if (purchase.release) {
    purchase.release.tracks.forEach((track: any, i: number) => {
      const filename = `${String(track.trackNumber).padStart(2, '0')} - ${track.title}.mp3`;
      downloads.push({ name: filename, url: `${base}/${i}` });
    });
  } else if ((purchase as any).distributionRelease) {
    (purchase as any).distributionRelease.tracks.forEach((track: any, i: number) => {
      const filename = `${String(track.trackNumber).padStart(2, '0')} - ${track.title}.mp3`;
      downloads.push({ name: filename, url: `${base}/distrib-${i}` });
    });
  } else if (purchase.video) {
    downloads.push({ name: `${purchase.video.title}.mp4`, url: `${base}/0` });
  } else if (purchase.sample) {
    downloads.push({ name: `${purchase.sample.title}.zip`, url: `${base}/0` });
  }

  return NextResponse.json({
    downloads,
    itemName: purchase.beat?.title || purchase.release?.title || (purchase as any).distributionRelease?.title || purchase.video?.title || purchase.sample?.title || 'Your Purchase',
    downloadsLeft: 10 - purchase.downloadCount,
    licenseUrl,
    licenseKey: beatLicense?.licenseKey || null,
    itemType: purchase.itemType,
  });
}
