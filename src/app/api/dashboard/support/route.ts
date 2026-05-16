import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
  const transactions = await prisma.supportTxn.findMany({
    where: { artistId: user.artist.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ transactions });
  } catch(e) { return NextResponse.json({ transactions: [], dbError: true }); }
}
