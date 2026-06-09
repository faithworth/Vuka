export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug');
    const q = req.nextUrl.searchParams.get('q') || '';
    const sort = req.nextUrl.searchParams.get('sort') || 'newest';

    // Single sample lookup
    if (slug) {
      const sample = await prisma.sample.findUnique({
        where: { slug },
        include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
      });
      if (!sample || !sample.isActive) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ sample });
    }

    // List all samples
    const orderBy: any =
      sort === 'price_asc' ? { price: 'asc' } :
      sort === 'price_desc' ? { price: 'desc' } :
      { createdAt: 'desc' };

    const samples = await prisma.sample.findMany({
      where: {
        isActive: true,
        ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
      orderBy,
      take: 60,
    });
    return NextResponse.json({ samples });
  } catch (err) {
    console.error('[store/samples] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
