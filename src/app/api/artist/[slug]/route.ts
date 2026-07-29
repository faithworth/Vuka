// src/app/api/artist/[slug]/route.ts
import { getEffectivePlan }  from '@/lib/plans';
import { coerceStringArray } from '@/lib/coerce-array';

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
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

    if (!artist) {
      // The slug may have changed (someone updated their display name in
      // Settings, which auto-updates their slug). Check history before
      // giving up, so old shared links keep working instead of 404ing.
      const history = await prisma.artistSlugHistory.findUnique({
        where: { oldSlug: params.slug },
        include: { artist: { select: { slug: true } } },
      });
      if (history?.artist) {
        return NextResponse.json({ redirectTo: history.artist.slug }, { status: 200 });
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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
        _hideBrandingRequested: sections.hideBranding === true, // resolved below once plan is known
      };
    }

    const effectivePlan = getEffectivePlan(
      (artist as any).planSlug ?? 'free',
      (artist as any).planExpiresAt ?? null,
    );

    // White-label only ever takes effect on an active Label plan — recomputed
    // fresh on every request (not read from a stored "is label" flag) so a
    // lapsed/downgraded plan shows the "Powered by Vuka" badge again
    // automatically without anyone needing to touch the stored toggle.
    if (storefront) {
      const requested = (storefront as any)._hideBrandingRequested;
      delete (storefront as any)._hideBrandingRequested;
      storefront.hideBranding = effectivePlan.slug === 'label' && requested;
    }

    return NextResponse.json({
      ...artist,
      // Defensive coercion until 20260624_fix_string_array_column_types migration lands
      genreTags:            coerceStringArray((artist as any).genreTags),
      beats:                (artist.beats ?? []).map(b => ({ ...b, tags: coerceStringArray((b as any).tags) })),
      videos:               (artist.videos ?? []).map(v => ({ ...v, tags: coerceStringArray((v as any).tags) })),
      samples:              (artist.samples ?? []).map(s => ({ ...s, tags: coerceStringArray((s as any).tags) })),
      merch:                (artist.merch ?? []).map(m => ({ ...m, sizes: coerceStringArray((m as any).sizes) })),
      subscriptionTiers:    subscriptionTiers.map(t => ({ ...t, perks: coerceStringArray((t as any).perks) })),
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
