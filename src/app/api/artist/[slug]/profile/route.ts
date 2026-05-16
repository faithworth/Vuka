import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const artist = await prisma.artist.findUnique({
    where: { slug: params.slug },
    select: {
      id: true, slug: true, name: true, bio: true, city: true, country: true,
      photoUrl: true, coverUrl: true, genreTags: true, socialLinks: true,
      currency: true, totalPlays: true, payfastMerchant: true, stripeAccountId: true,
      goals: { where: { isActive: true }, take: 1 },
    },
  });
  if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  return NextResponse.json(artist);
}
