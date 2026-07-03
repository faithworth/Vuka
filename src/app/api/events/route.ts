export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/events?when=upcoming&q=search&city=xxx&cursor=xxx
// Public browse listing — no auth required. Only ever returns events
// that are published (never 'draft' or 'cancelled').
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const when   = searchParams.get('when') || 'upcoming'; // upcoming | past | all
  const q      = searchParams.get('q')?.trim() || '';
  const city   = searchParams.get('city')?.trim() || '';
  const cursor = searchParams.get('cursor') || undefined;
  const take   = 24;
  const now    = new Date();

  const where: any = {
    status: 'published',
    ...(when === 'upcoming' && { startDate: { gte: now } }),
    ...(when === 'past'     && { startDate: { lt: now } }),
    ...(q    && { title: { contains: q, mode: 'insensitive' } }),
    ...(city && { city: { contains: city, mode: 'insensitive' } }),
  };

  const events = await prisma.event.findMany({
    where,
    orderBy: { startDate: when === 'past' ? 'desc' : 'asc' },
    take: take + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: {
      artist: { select: { name: true, slug: true, photoUrl: true } },
      tickets: { select: { price: true }, orderBy: { price: 'asc' }, take: 1 },
      _count: { select: { purchases: { where: { status: 'confirmed' } } } },
    },
  });

  const hasMore = events.length > take;
  const page = hasMore ? events.slice(0, take) : events;

  return NextResponse.json({
    events: page.map(e => ({
      id: e.id, title: e.title, description: e.description, coverUrl: e.coverUrl,
      venue: e.venue, city: e.city, province: e.province,
      startDate: e.startDate, endDate: e.endDate, slug: e.slug,
      fromPrice: e.tickets[0]?.price ?? null,
      attendeeCount: e._count.purchases, artist: e.artist,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
