export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const events = await prisma.event.findMany({
    where: { artistId: user.artist.id },
    include: { tickets: true, _count: { select: { purchases: { where: { status: 'confirmed' } } } } },
    orderBy: { startDate: 'asc' },
  });
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { title, description, venue, city, province, startDate, endDate, coverUrl, tickets } = body;
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  if (!startDate)     return NextResponse.json({ error: 'Start date required' }, { status: 400 });
  if (!tickets?.length) return NextResponse.json({ error: 'At least one ticket type required' }, { status: 400 });
  for (const t of tickets) {
    if (!t.name?.trim()) return NextResponse.json({ error: 'Each ticket needs a name' }, { status: 400 });
    if (t.price === undefined || t.price < 0) return NextResponse.json({ error: 'Each ticket needs a price (0 for free)' }, { status: 400 });
  }
  let slug = slugify(title);
  let n = 0;
  while (await prisma.event.findUnique({ where: { slug } })) slug = `${slugify(title)}-${++n}`;
  const event = await prisma.event.create({
    data: {
      id: `ev_${Date.now()}`, artistId: user.artist.id,
      title: title.trim(), description: description ?? '', venue: venue ?? '',
      city: city ?? '', province: province ?? '',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      coverUrl: coverUrl ?? '', slug,
      tickets: { create: tickets.map((t: any) => ({
        id: `et_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
        name: t.name.trim(), description: t.description ?? '',
        price: parseFloat(t.price), currency: 'ZAR',
        quantity: t.quantity ? parseInt(t.quantity) : null,
      })) },
    },
    include: { tickets: true },
  });
  return NextResponse.json({ ok: true, event });
}
