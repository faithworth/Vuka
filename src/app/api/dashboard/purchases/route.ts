export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = user.artist.id;

  try {
  const purchases = await prisma.purchase.findMany({
    where: {
      status: 'confirmed',
      OR: [{ beat: { artistId } }, { release: { artistId } }],
    },
    include: {
      beat: { select: { title: true, slug: true } },
      release: { select: { title: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ purchases });
  } catch(e) { return NextResponse.json({ purchases: [], dbError: true }); }
}
