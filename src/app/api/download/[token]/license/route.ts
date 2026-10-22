import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateLicensePDF } from '@/lib/pdf';
import { r2, r2Keys, uploadBuffer } from '@/lib/r2';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vuka-audio';

async function licenseExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const purchase = await prisma.purchase.findUnique({
    where: { downloadToken: token },
    include: { beat: { include: { artist: true } } },
  });

  if (!purchase) return NextResponse.json({ error: 'Invalid download link' }, { status: 404 });
  if (purchase.status !== 'confirmed') return NextResponse.json({ error: 'Payment not confirmed' }, { status: 402 });

  const expires = new Date(purchase.createdAt);
  expires.setDate(expires.getDate() + 30);
  if (new Date() > expires) return NextResponse.json({ error: 'Download link expired. Use the re-download portal.' }, { status: 410 });
  if (purchase.downloadCount >= 10) return NextResponse.json({ error: 'Download limit reached. Use the re-download portal.' }, { status: 429 });
  if (!purchase.beat || purchase.itemType !== 'beat') {
    return NextResponse.json({ error: 'License PDF is only available for beat purchases.' }, { status: 404 });
  }

  const key = r2Keys.license(purchase.licenseId);
  if (!(await licenseExists(key))) {
    const saved = purchase.licenseTermsSnapshot as { clauses?: unknown } | null;
    const customTerms = Array.isArray(saved?.clauses)
      ? saved.clauses.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : undefined;
    const pdf = await generateLicensePDF({
      licenseId: purchase.licenseId,
      licenseType: purchase.licenseType || 'standard',
      beatTitle: purchase.beat.title,
      artistName: purchase.beat.artist.name,
      buyerName: purchase.buyerName,
      buyerEmail: purchase.buyerEmail,
      amount: purchase.amount,
      currency: purchase.currency,
      date: purchase.createdAt,
      itemKind: 'beat',
      customTerms,
    });
    await uploadBuffer(key, pdf, 'application/pdf');
    const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL;
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { licenseUrl: publicBase ? `${publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase}/${key}` : null },
    });
  }

  const licenseIndex = (purchase.beat.fullWavUrl ? 1 : 0) + (purchase.beat.fullMp3Url ? 1 : 0);
  return NextResponse.redirect(new URL(`/api/download/${token}/file/${licenseIndex}`, new URL(_req.url).origin), 307);
}
