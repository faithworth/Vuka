export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { requireArtist } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.app';
  const profileUrl = `${appUrl}/artist/${user.artist.slug}`;

  const qrDataUrl = await QRCode.toDataURL(profileUrl, {
    width: 512,
    margin: 2,
    color: {
      dark: '#38b6e8',
      light: '#0d0b14',
    },
    errorCorrectionLevel: 'H',
  });

  // Return as PNG buffer
  const base64Data = qrDataUrl.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="vuka-qr-${user.artist.slug}.png"`,
    },
  });
}
