import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerUser } from '@/lib/auth';

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await prisma.wishlistItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  // Hydrate with beat/release details
  const hydrated = await Promise.all(items.map(async (item: { id: string; itemId: string; itemType: string; userId: string; createdAt: Date }) => {
    let detail: any = null;
    try {
      if (item.itemType === 'beat') {
        detail = await prisma.beat.findUnique({
          where: { id: item.itemId },
          select: { title: true, slug: true, artworkUrl: true, basicPrice: true, artist: { select: { name: true } } },
        });
      } else if (item.itemType === 'release') {
        detail = await prisma.release.findUnique({
          where: { id: item.itemId },
          select: { title: true, slug: true, artworkUrl: true, price: true, artist: { select: { name: true } } },
        });
      }
    } catch {}
    return { ...item, detail };
  }));

  return NextResponse.json({ items: hydrated });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemType, itemId } = await req.json();

  const existing = await prisma.wishlistItem.findFirst({
    where: { userId: user.id, itemType, itemId },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return NextResponse.json({ added: false });
  }

  const item = await prisma.wishlistItem.create({
    data: { userId: user.id, itemType, itemId },
  });

  return NextResponse.json({ added: true, item });
}
