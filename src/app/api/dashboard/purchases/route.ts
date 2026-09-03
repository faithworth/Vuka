export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (user.artist) {
      // Artist: show all sales received across every item type they own
      const artistId = user.artist.id;
      const purchases = await prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [
            { beat:    { artistId } },
            { release: { artistId } },
            { video:   { artistId } },
            { sample:  { artistId } },
            { merch:   { artistId } },
            { artistId },
          ],
        },
        include: {
          beat:    { select: { title: true, slug: true } },
          release: { select: { title: true, slug: true } },
          video:   { select: { title: true, slug: true } },
          sample:  { select: { title: true, slug: true } },
          merch:   { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      // shippingFee/shippingAddress/fulfillmentStatus/trackingRef/shippedAt are
      // already present on each `purchase` row via findMany's default select-all
      // (no explicit `select` used above), so the artist dashboard can read them
      // directly for merch orders without an extra query.
      return NextResponse.json({ purchases, role: 'artist' });
    } else {
      // Fan: show every confirmed purchase they made — match by userId OR email
      // to cover both logged-in and guest checkout purchases
      const purchases = await prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [
            { userId:     user.id },
            { buyerEmail: user.email! },
          ],
        },
        select: {
          id:            true,
          createdAt:     true,
          amount:        true,
          currency:      true,
          downloadToken: true,
          licenseType:   true,
          itemType:      true,
          beat: {
            select: {
              title:     true,
              slug:      true,
              artworkUrl: true,
              artist:    { select: { name: true, slug: true } },
            },
          },
          release: {
            select: {
              title:     true,
              slug:      true,
              artworkUrl: true,
              artist:    { select: { name: true, slug: true } },
            },
          },
          video: {
            select: {
              title:        true,
              slug:         true,
              thumbnailUrl: true,
              artist:       { select: { name: true, slug: true } },
            },
          },
          sample: {
            select: {
              title:     true,
              slug:      true,
              artworkUrl: true,
              artist:    { select: { name: true, slug: true } },
            },
          },
          merch: {
            select: {
              title:    true,
              slug:     true,
              imageUrl: true,
              artist:   { select: { name: true, slug: true } },
            },
          },
          artist: { select: { name: true, slug: true } },
          shippingFee:       true,
          fulfillmentStatus: true,
          trackingRef:       true,
          shippedAt:         true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return NextResponse.json({ purchases, role: 'fan' });
    }
  } catch (e) {
    console.error('[dashboard/purchases] error:', e);
    return NextResponse.json({ purchases: [], dbError: true });
  }
}
