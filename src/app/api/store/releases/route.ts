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

    // ── Distribution releases (live artist uploads) ───────────
    const distribWhere: Record<string, unknown> = { status: 'live' };
    if (q)    distribWhere.title       = { contains: q, mode: 'insensitive' };
    if (type) distribWhere.releaseType = type.toLowerCase();

    const distribReleases = await prisma.distributionRelease.findMany({
      where: distribWhere,
      include: {
        artist: { select: { name: true, slug: true, photoUrl: true } },
        tracks: { select: { id: true, title: true, trackNumber: true, duration: true, fileUrl: true, masterFileUrl: true } },
      },
      orderBy: { liveAt: 'desc' },
      take: limit,
    });

    // Normalise distribution releases to the same shape as store releases
    const r2Base = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';
    const normDistrib = distribReleases.map(r => ({
      id:          r.id,
      slug:        null,
      _isDistrib:  true,
      title:       r.title,
      releaseType: r.releaseType,
      artworkUrl:  r.artworkUrl,
      price:       (r as any).price ?? 0,
      minPrice:    (r as any).minPrice ?? 0,
      payWhatWant: (r as any).payWhatYouWant ?? false,
      isActive:    true,
      createdAt:   r.createdAt,
      upc:         r.upc,
      artist:      r.artist,
      tracks:      r.tracks.map((t: any) => {
        const raw = t.fileUrl || t.masterFileUrl || '';
        const previewUrl = raw.startsWith('http') ? raw : (r2Base && raw ? `${r2Base}/${raw}` : null);
        return { id: t.id, title: t.title, trackNumber: t.trackNumber, duration: t.duration ?? 0, previewUrl };
      }),
    }));

    // Merge and re-sort by createdAt
    const allReleases = [...storeReleases, ...normDistrib]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice((page - 1) * limit, page * limit);

    const total = storeReleases.length + distribReleases.length;

    return NextResponse.json({
      releases: allReleases,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('DB error (releases):', err);
    return NextResponse.json({ releases: [], total: 0, page: 1, pages: 0, dbError: true });
  }
}
