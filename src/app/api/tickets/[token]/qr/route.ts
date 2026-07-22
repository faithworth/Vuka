
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const purchase = await prisma.ticketPurchase.findUnique({
    where: { qrToken: token },
    select: { qrToken: true },
  });
  if (!purchase) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The QR encodes ONLY the opaque token — never the purchaseId, buyer
  // details, or signature. The gate scanner looks everything else up
  // server-side from this single value.
  const qrDataUrl = await QRCode.toDataURL(purchase.qrToken, {
    width: 512,
    margin: 2,
    color: { dark: '#0d0b14', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  const buffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store', // never cache — a stale copy in a shared cache is a shareable ticket
    },
  });
}
