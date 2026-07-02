import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase';
import { createMarketplaceOrder } from '@/lib/marketplace';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, include: { artist: true } });
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') || 'buyer';

    const orders = await prisma.marketplaceOrder.findMany({
      where: role === 'seller' && dbUser.artist
        ? { sellerArtistId: dbUser.artist.id }
        : { buyerUserId: dbUser.id },
      include: {
        service: { select: { title: true, category: true } },
        seller:  { select: { name: true, slug: true, photoUrl: true } },
        dispute: true,
        review:  true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('Marketplace orders GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { serviceId, requirements } = await req.json();
    if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });

    const order = await createMarketplaceOrder({
      serviceId,
      buyerUserId:  user.id,
      requirements: requirements || '',
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
