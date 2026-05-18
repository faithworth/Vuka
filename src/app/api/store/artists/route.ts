import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || '';
  if (!q || q.length < 2) return NextResponse.json({ artists: [] });

  try {
    const artists = await prisma.artist.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { genreTags: { has: q } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, name: true, slug: true, photoUrl: true,
        city: true, country: true, genreTags: true,
        _count: { select: { beats: true, releases: true } },
      },
      take: 6,
    });
    return NextResponse.json({ artists });
  } catch {
    return NextResponse.json({ artists: [] });
  }
}
