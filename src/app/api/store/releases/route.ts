import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q     = searchParams.get('q') || '';
  const slug  = searchParams.get('slug') || '';
  const type  = searchParams.get('type') || '';
  const sort  = searchParams.get('sort') || 'newest';
  const page  = parseInt(searchParams.get('page') || '1');
  const limit = 20;

  // Direct slug lookup — only store releases have slugs
  if (slug) {
    try {
      const release = await prisma.release.findUnique({
        where: { slug },
        include: {
          artist: { select: { name: true, slug: true, photoUrl: true } },
          tracks: { orderBy: { trackNumber: 'asc' } },
        },
      });
      return NextResponse.json({ releases: release ? [release] : [] });
    } catch { return NextResponse.json({ releases: [] }); }
  }

  const orderBy =
    sort === 'plays'       ? { plays: 'desc' as const }
    : sort === 'price_asc' ? { price: 'asc' as const }
    : sort === 'price_desc'? { price: 'desc' as const }
    : { createdAt: 'desc' as const };

  try {
    // ── Beat-store releases (Release model) ──────────────────
    const storeWhere: Record<string, unknown> = { isActive: true };
    if (q)    storeWhere.title       = { contains: q, mode: 'insensitive' };
    if (type) storeWhere.releaseType = type;

    const storeReleases = await prisma.release.findMany({
      where: storeWhere,
      include: {
        artist: { select: { name: true, slug: true, photoUrl: true } },
        tracks: { select: { id: true, title: true, trackNumber: true, duration: true, previewUrl: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      releases: storeReleases,
      total: storeReleases.length,
      page,
      pages: Math.ceil(storeReleases.length / limit),
    });
  } catch (err) {
    console.error('DB error (releases):', err);
    return NextResponse.json({ releases: [], total: 0, page: 1, pages: 0, dbError: true });
  }
}
