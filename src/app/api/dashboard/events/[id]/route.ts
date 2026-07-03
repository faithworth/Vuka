export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
type P = { params: { id: string } };

export async function GET(_: NextRequest, { params }: P) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({
    where: { id: params.id, artistId: user.artist.id },
    include: {
      tickets: true,
      purchases: { where: { status: 'confirmed' }, orderBy: { createdAt: 'desc' }, take: 100 },
      _count: { select: { purchases: { where: { status: 'confirmed' } } } },
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const revenue = event.purchases.reduce((s, p) => s + p.totalAmount, 0);
  return NextResponse.json({ event, revenue });
}

export async function PATCH(req: NextRequest, { params }: P) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ev = await prisma.event.findFirst({ where: { id: params.id, artistId: user.artist.id } });
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  if (body.action === 'publish') {
    const updated = await prisma.event.update({
      where: { id: params.id },
      data: { status: 'published' },
      include: { tickets: true, _count: { select: { purchases: { where: { status: 'confirmed' } } } } },
    });
    return NextResponse.json({ ok: true, event: updated });
  }
  if (body.action === 'cancel') {
    const updated = await prisma.event.update({
      where: { id: params.id },
      data: { status: 'cancelled' },
      include: { tickets: true, _count: { select: { purchases: { where: { status: 'confirmed' } } } } },
    });
    return NextResponse.json({ ok: true, event: updated });
  }
  if (ev.status !== 'draft') return NextResponse.json({ error: 'Only draft events can be edited' }, { status: 400 });
  const { title, description, venue, city, province, startDate, endDate, coverUrl } = body;
  const updated = await prisma.event.update({
    where: { id: params.id },
    data: {
      ...(title       && { title: title.trim() }),
      ...(description !== undefined && { description }),
      ...(venue       !== undefined && { venue }),
      ...(city        !== undefined && { city }),
      ...(province    !== undefined && { province }),
      ...(startDate   && { startDate: new Date(startDate) }),
      ...(endDate     !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(coverUrl    !== undefined && { coverUrl }),
    },
    include: { tickets: true, _count: { select: { purchases: { where: { status: 'confirmed' } } } } },
  });
  return NextResponse.json({ ok: true, event: updated });
}

export async function DELETE(_: NextRequest, { params }: P) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ev = await prisma.event.findFirst({ where: { id: params.id, artistId: user.artist.id } });
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ev.status !== 'draft') return NextResponse.json({ error: 'Only drafts can be deleted' }, { status: 400 });
  await prisma.event.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
