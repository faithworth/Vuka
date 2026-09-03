// src/app/api/dashboard/merch/ship/route.ts
// POST — artist marks a confirmed merch Purchase as shipped, with a courier
// tracking reference. Sends the buyer a notification email.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sendMerchShipped } from '@/lib/emails';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { purchaseId, trackingRef } = await req.json();
    if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { merch: { include: { artist: true } } },
    });

    if (!purchase || purchase.itemType !== 'merch' || !purchase.merch)
      return NextResponse.json({ error: 'Not a merch order' }, { status: 404 });
    if (purchase.merch.artistId !== user.artist.id)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (purchase.status !== 'confirmed')
      return NextResponse.json({ error: 'Order is not confirmed yet' }, { status: 400 });

    const updated = await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        fulfillmentStatus: 'shipped',
        trackingRef: trackingRef || '',
        shippedAt: new Date(),
      },
    });

    try {
      await sendMerchShipped({
        to: purchase.buyerEmail,
        buyerName: purchase.buyerName,
        itemName: purchase.merch.title,
        artistName: purchase.merch.artist.name,
        trackingRef: trackingRef || '',
        ordersUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com'}/dashboard/purchases`,
      });
    } catch (e) {
      logger.error('[dashboard/merch/ship] buyer email failed', { error: String(e) });
    }

    return NextResponse.json({ purchase: updated });
  } catch (err) {
    console.error('[dashboard/merch/ship] error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
