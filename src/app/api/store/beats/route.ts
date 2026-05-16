import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const slug = searchParams.get('slug') || '';
  const genre = searchParams.get('genre') || '';
  const mood = searchParams.get('mood') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 20;

  // Direct slug lookup
  if (slug) {
    try {
      const beat = await prisma.beat.findUnique({
        where: { slug },
        include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
      });
      return NextResponse.json({ beats: beat ? [beat] : [] });
    } catch { return NextResponse.json({ beats: [] }); }
  }

  const where: Record<string, unknown> = { isActive: true };
  if (q) where.title = { contains: q, mode: 'insensitive' };
  if (genre) where.genre = genre;
  if (mood) where.mood = mood;

  const orderBy =
    sort === 'plays' ? { plays: 'desc' as const }
    : sort === 'price_asc' ? { basicPrice: 'asc' as const }
    : sort === 'price_desc' ? { basicPrice: 'desc' as const }
    : { createdAt: 'desc' as const };

  try {
    const [beats, total] = await Promise.all([
      prisma.beat.findMany({
        where,
        include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.beat.count({ where }),
    ]);
    return NextResponse.json({ beats, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('DB error (beats):', err);
    return NextResponse.json({ beats: [], total: 0, page: 1, pages: 0, dbError: true });
  }
}
