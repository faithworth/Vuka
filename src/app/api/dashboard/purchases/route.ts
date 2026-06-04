export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (user.artist) {
      // Artist: show sales received
      const artistId = user.artist.id;
      const purchases = await prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [{ beat: { artistId } }, { release: { artistId } }],
        },
        include: {
          beat: { select: { title: true, slug: true } },
          release: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return NextResponse.json({ purchases, role: 'artist' });
    } else {
      // Fan: show their own purchases — match by userId OR buyerEmail
      const purchases = await prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [
            { userId: user.id },
            { buyerEmail: user.email! },
          ],
        },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          currency: true,
          downloadToken: true,
          licenseType: true,
          itemType: true,
          beat: { select: { title: true, slug: true, artworkUrl: true, artist: { select: { name: true, slug: true } } } },
          release: { select: { title: true, slug: true, artworkUrl: true, artist: { select: { name: true, slug: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return NextResponse.json({ purchases, role: 'fan' });
    }
  } catch (e) {
    return NextResponse.json({ purchases: [], dbError: true });
  }
}
