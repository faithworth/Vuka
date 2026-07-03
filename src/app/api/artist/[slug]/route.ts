// src/app/api/artist/[slug]/route.ts
import { getEffectivePlan }  from '@/lib/plans';
import { coerceStringArray } from '@/lib/coerce-array';

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
        videos: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        samples: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        merch: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        supportReceived: {
          where: { status: 'confirmed', isPublic: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { fanName: true, amount: true, currency: true, message: true, tier: true, createdAt: true },
        },
        campaigns: {
          where: { status: { in: ['active', 'funded'] } },
          orderBy: { createdAt: 'desc' },
          include: {
            tiers: { orderBy: { amount: 'asc' } },
            _count: { select: { backers: { where: { status: 'confirmed' } } } },
          },
        },
        followers: { select: { id: true } },
      },
    });

    if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

    const subscriptionTiers = await prisma.creatorSubscriptionTier.findMany({
      where: { artistId: artist.id, isActive: true },
      orderBy: { price: 'asc' },
      include: { _count: { select: { memberships: true } } },
    }).catch(() => []);

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

    const effectivePlan = getEffectivePlan(
      (artist as any).planSlug ?? 'free',
      (artist as any).planExpiresAt ?? null,
    );

    return NextResponse.json({
      ...artist,
      // Defensive coercion until 20260624_fix_string_array_column_types migration lands
      genreTags:            coerceStringArray((artist as any).genreTags),
      beats:                (artist.beats ?? []).map(b => ({ ...b, tags: coerceStringArray((b as any).tags) })),
      videos:               (artist.videos ?? []).map(v => ({ ...v, tags: coerceStringArray((v as any).tags) })),
      samples:              (artist.samples ?? []).map(s => ({ ...s, tags: coerceStringArray((s as any).tags) })),
      merch:                (artist.merch ?? []).map(m => ({ ...m, sizes: coerceStringArray((m as any).sizes) })),
      subscriptionTiers:    subscriptionTiers.map(t => ({ ...t, perks: coerceStringArray((t as any).perks) })),
      distributionReleases: normalisedDistribReleases,
      storefront,
      socialLinks:     (artist as any).socialLinks || storefront?.socialLinks || {},
      artistSharePct:  effectivePlan.artistSharePct,
      platformFeePct:  effectivePlan.platformFeePct,
    });
  } catch (err) {
    console.error('DB error (artist):', err);
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
