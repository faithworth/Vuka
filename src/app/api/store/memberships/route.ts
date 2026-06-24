// src/app/api/store/memberships/route.ts
// Public listing of active membership tiers across all artists.
// Mirrors the shape and conventions of /api/store/beats, /api/store/merch, etc.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma                        from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const artistSlug = searchParams.get('artistSlug') ?? '';
    const artistId   = searchParams.get('artistId')   ?? '';
    const q          = searchParams.get('q')          ?? '';
    const sort       = searchParams.get('sort')       ?? 'price_asc';
    const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit      = 24;

    // ── Artist filter ──────────────────────────────────────────────────────────
    // Supports either ?artistSlug= (from public profile pages) or ?artistId=
    let resolvedArtistId: string | undefined;

    if (artistId) {
      resolvedArtistId = artistId;
    } else if (artistSlug) {
      const artist = await prisma.artist.findUnique({
        where:  { slug: artistSlug },
        select: { id: true },
      });
      if (!artist) return NextResponse.json({ tiers: [], total: 0, page, pages: 0 });
      resolvedArtistId = artist.id;
    }

    // ── Where clause ───────────────────────────────────────────────────────────
    const where = {
      isActive: true,
      ...(resolvedArtistId ? { artistId: resolvedArtistId } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    // ── Order ──────────────────────────────────────────────────────────────────
    const orderBy =
      sort === 'price_desc' ? { price: 'desc' as const } :
      sort === 'newest'     ? { createdAt: 'desc' as const } :
      { price: 'asc' as const };   // default: cheapest first

    // ── Query ──────────────────────────────────────────────────────────────────
    const [tiers, total] = await Promise.all([
      prisma.creatorSubscriptionTier.findMany({
        where,
        orderBy,
        skip:    (page - 1) * limit,
        take:    limit,
        include: {
          artist: {
            select: {
              id:       true,
              name:     true,
              slug:     true,
              photoUrl: true,
              city:     true,
              country:  true,
              genreTags: true,
            },
          },
          _count: { select: { memberships: true } },
        },
      }),
      prisma.creatorSubscriptionTier.count({ where }),
    ]);

    return NextResponse.json({
      tiers,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[store/memberships] GET error:', err);
    return NextResponse.json(
      { tiers: [], total: 0, page: 1, pages: 0, dbError: true },
      { status: 500 },
    );
  }
}
