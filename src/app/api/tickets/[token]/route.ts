
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const purchase = await prisma.ticketPurchase.findUnique({
    where: { qrToken: token },
    include: {
      event: { select: { title: true, venue: true, city: true, province: true, startDate: true, coverUrl: true, artist: { select: { name: true } } } },
      ticket: { select: { name: true } },
    },
  });

  if (!purchase) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only ever expose what's needed to display/verify the ticket — never
  // the signature (that's a server-only integrity check) or other fans'
  // rows from the same purchase batch.
  return NextResponse.json({
    buyerName:   purchase.buyerName,
    ticketName:  purchase.ticket.name,
    status:      purchase.status,
    checkedIn:   !!purchase.checkedInAt,
    checkedInAt: purchase.checkedInAt,
    event: {
      title:    purchase.event.title,
      artist:   purchase.event.artist.name,
      venue:    purchase.event.venue,
      city:     purchase.event.city,
      province: purchase.event.province,
      startDate: purchase.event.startDate,
      coverUrl: purchase.event.coverUrl,
    },
  });
}
