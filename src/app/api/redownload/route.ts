import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendRedownloadLinks } from '@/lib/emails';
import { getPresignedDownloadUrl, r2Keys } from '@/lib/r2';

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const purchases = await prisma.purchase.findMany({
    where: { buyerEmail: { equals: email, mode: 'insensitive' }, status: 'confirmed' },
    include: { beat: true, release: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (purchases.length === 0) {
    return NextResponse.json({ error: 'No purchases found for this email' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const purchaseList = purchases.map((p: any) => ({
    itemName: p.beat?.title || p.release?.title || 'Purchase',
    downloadUrl: `${appUrl}/download/${p.downloadToken}`,
    date: p.createdAt.toLocaleDateString('en-ZA'),
    licenseId: p.licenseId,
  }));

  await sendRedownloadLinks({ to: email, buyerName: purchases[0]?.buyerName ?? 'Customer', purchases: purchaseList });

  return NextResponse.json({ ok: true });
}
