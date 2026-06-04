export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const artist = await prisma.artist.findUnique({
      where: { slug: params.slug },
      include: {
        beats: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        releases: {
          where: { isActive: true },
          include: { tracks: { orderBy: { trackNumber: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        supportReceived: {
          where: { status: 'confirmed', isPublic: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { fanName: true, amount: true, currency: true, message: true, tier: true, createdAt: true },
        },
        goals: { where: { isActive: true } },
        followers: { select: { id: true } },
      },
    });
    if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(artist);
  } catch (err) {
    console.error('DB error (artist):', err);
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
