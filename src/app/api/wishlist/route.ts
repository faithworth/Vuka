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

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemType, itemId } = await req.json();

  // Toggle: remove if exists
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
