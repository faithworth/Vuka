export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
type P = { params: { slug: string } };

export async function GET(_: NextRequest, { params }: P) {
  const event = await prisma.event.findUnique({
    where: { slug: params.slug },
    include: {
      artist: { select: { name: true, slug: true, photoUrl: true } },
      tickets: { orderBy: { price: 'asc' } },
      _count: { select: { purchases: { where: { status: 'confirmed' } } } },
    },
  });
  if (!event || event.status !== 'published') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Attach sold count per ticket
  const ticketsWithAvail = await Promise.all(event.tickets.map(async t => {
    const sold = await prisma.ticketPurchase.aggregate({
      _sum: { quantity: true },
      where: { ticketId: t.id, status: 'confirmed' },
    });
    const soldQty = sold._sum.quantity ?? 0;
    return { ...t, sold: soldQty, available: t.quantity ? t.quantity - soldQty : null };
  }));
  return NextResponse.json({ event: { ...event, tickets: ticketsWithAvail } });
}
