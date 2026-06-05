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

    // Fetch live distribution releases and attach them
    const distributionReleases = await prisma.distributionRelease.findMany({
      where: { artistId: artist.id, status: 'live' },
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
      orderBy: { liveAt: 'desc' },
      take: 50,
    }).catch(() => []);

    const normalisedDistribReleases = distributionReleases.map(r => ({
      id: r.id,
      slug: r.id,
      title: r.title,
      releaseType: r.releaseType,
      artworkUrl: r.artworkUrl,
      price: null,
      isActive: true,
      upc: r.upc,
      distributor: r.distributor,
      _isDistribution: true,
      tracks: r.tracks.map(t => ({
        id: t.id,
        title: t.title,
        trackNumber: t.trackNumber,
        duration: t.duration ?? 0,
        previewUrl: t.fileUrl || t.masterFileUrl || null,
        isrc: t.isrc,
      })),
    }));

    // Fetch storefront so tagline, bioLong, accentColor show on the public profile
    const storefrontRaw = await prisma.creatorStorefront.findUnique({
      where: { artistId: artist.id },
    }).catch(() => null);

    let storefront: Record<string, any> | null = null;
    if (storefrontRaw) {
      let sections: Record<string, any> = {};
      try {
        const parsed = storefrontRaw.sections;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          sections = parsed as Record<string, any>;
        }
      } catch {}
      storefront = {
        tagline:         storefrontRaw.headline || '',
        bioLong:         storefrontRaw.description || '',
        accentColor:     storefrontRaw.theme && storefrontRaw.theme.startsWith('#')
                           ? storefrontRaw.theme : '#38b6e8',
        showSupport:     sections.showSupport !== false,
        socialLinks:     sections.socialLinks || {},
        featuredBeatIds: sections.featuredBeatIds || [],
      };
    }

    return NextResponse.json({
      ...artist,
      distributionReleases: normalisedDistribReleases,
      storefront,
    });
  } catch (err) {
    console.error('DB error (artist):', err);
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
