// ============================================================
// PHASE 2 — src/app/api/marketplace/orders/route.ts
// Marketplace orders: create (buyer) and list (buyer or seller)
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createMarketplaceOrder, acceptOrder } from '@/lib/marketplace';

// GET — list orders for the caller (as buyer or seller)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const role   = searchParams.get('role') || 'buyer';   // buyer | seller
    const status = searchParams.get('status') || undefined;

    let orders;
    if (role === 'seller' && user.artist) {
      orders = await prisma.marketplaceOrder.findMany({
        where: {
          sellerArtistId: user.artist.id,
          ...(status ? { status } : {}),
        },
        include: {
          service: { select: { id: true, title: true, category: true } },
          buyer: { select: { id: true, name: true, email: true } },
          milestones: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } else {
      orders = await prisma.marketplaceOrder.findMany({
        where: {
          buyerUserId: user.id,
          ...(status ? { status } : {}),
        },
        include: {
          service: { select: { id: true, title: true, category: true } },
          seller: { select: { id: true, name: true, slug: true, photoUrl: true } },
          milestones: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('[marketplace/orders] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — place an order (buyer action)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { serviceId, packageName, requirements } = await req.json();
    if (!serviceId)    return NextResponse.json({ error: 'serviceId required' }, { status: 400 });
    if (!packageName)  return NextResponse.json({ error: 'packageName required' }, { status: 400 });

    const order = await createMarketplaceOrder({
      serviceId,
      buyerUserId: user.id,
      packageName,
      requirements,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err: any) {
    console.error('[marketplace/orders] POST error:', err?.message);
    const code = err?.message?.includes('Cannot order') || err?.message?.includes('not found') ? 400 : 503;
    return NextResponse.json({ error: err?.message || 'Failed to create order' }, { status: code });
  }
}
