// src/app/api/dashboard/orders/[id]/fulfill/route.ts
// PATCH — artist marks a physical merch purchase as shipped, with a
// tracking carrier + reference. This is the "current phase" fulfilment
// model described in Vuka_Music_Business_Documentation.docx section 3.5:
// the artist manually books a courier (Pudo, PostNet, Courier Guy, etc.)
// and provides a tracking reference to the fan — no courier-API label
// generation yet, that's a future enhancement.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const fulfillSchema = z.object({
  trackingCarrier: z.string().min(1, 'Carrier is required').max(60),
  trackingRef:     z.string().min(1, 'Tracking reference is required').max(120),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireArtist();
    if (!user?.artist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await req.json();
    const parsed = fulfillSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { merch: { select: { artistId: true, title: true } } },
    });

    if (!purchase || purchase.itemType !== 'merch' || !purchase.merch) {
      return NextResponse.json({ error: 'Not a merch order' }, { status: 404 });
    }
    if (purchase.merch.artistId !== user.artist.id) {
      return NextResponse.json({ error: 'Unauthorized — not your order' }, { status: 403 });
    }
    if (purchase.status !== 'confirmed') {
      return NextResponse.json({ error: 'Order is not confirmed/paid yet' }, { status: 400 });
    }
    if (purchase.fulfillmentStatus === 'shipped' || purchase.fulfillmentStatus === 'delivered') {
      return NextResponse.json({ error: 'Order already marked shipped' }, { status: 409 });
    }

    const updated = await prisma.purchase.update({
      where: { id },
      data: {
        fulfillmentStatus: 'shipped',
        trackingCarrier: parsed.data.trackingCarrier,
        trackingRef: parsed.data.trackingRef,
        shippedAt: new Date(),
      },
    });

    // NOTE: no "your order has shipped" buyer email yet — sendPurchaseConfirmation
    // is for the initial purchase receipt, not a fulfilment update. A dedicated
    // template (order shipped, with tracking link) is the natural next step here;
    // deliberately not bolted onto the existing email helper in this pass.

    return NextResponse.json({
      ok: true,
      order: {
        id: updated.id,
        fulfillmentStatus: updated.fulfillmentStatus,
        trackingCarrier: updated.trackingCarrier,
        trackingRef: updated.trackingRef,
        shippedAt: updated.shippedAt,
      },
    });
  } catch (err) {
    console.error('[orders/fulfill/PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
