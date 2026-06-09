export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const video = await prisma.video.findUnique({
      where: { slug },
      include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
    });

    if (!video || !video.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ video });
  } catch (err) {
    console.error('[store/videos] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
