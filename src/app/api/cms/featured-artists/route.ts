// GET/POST/PUT /api/cms/featured-artists
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms, getFeaturedArtists, getAllFeaturedArtists } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const all = new URL(req.url).searchParams.get('all') === '1';
    if (all) {
      const user = await requireAdmin();
      if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return NextResponse.json({ artists: await getAllFeaturedArtists() });
    }
    return NextResponse.json({ artists: await getFeaturedArtists() });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { artistId, tagline, blurb } = await req.json();
    if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });
    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    const maxOrder = await prisma.featuredArtist.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
    const featured = await prisma.featuredArtist.create({
      data: { artistId, tagline: tagline?.trim() ?? '', blurb: blurb?.trim() ?? '', order: (maxOrder?.order ?? -1) + 1, createdById: user.id },
      include: { artist: { select: { id: true, slug: true, name: true, photoUrl: true, genreTags: true, city: true, isVerified: true } } },
    });
    return NextResponse.json({ featured }, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'Artist is already featured.' }, { status: 409 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { order: arr } = await req.json();
    if (!Array.isArray(arr)) return NextResponse.json({ error: 'order array required' }, { status: 400 });
    await Promise.all(arr.map((item: { id: string; order: number }) =>
      prisma.featuredArtist.update({ where: { id: item.id }, data: { order: item.order } })
    ));
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
