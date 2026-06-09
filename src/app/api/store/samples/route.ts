export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const sample = await prisma.sample.findUnique({
      where: { slug },
      include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
    });

    if (!sample || !sample.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ sample });
  } catch (err) {
    console.error('[store/samples] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
