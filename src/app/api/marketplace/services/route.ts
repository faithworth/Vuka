// ============================================================
// PHASE 2 — src/app/api/marketplace/services/route.ts
// List public services; artists create/manage their own services
// FIXED: Coerce deliveryDays/price to numbers to prevent Prisma type errors.
// FIXED: Return actual error message in dev for debugging.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma, { queryRaw, executeRaw } from '@/lib/prisma';
import { checkFeatureCap, countActiveServiceListings } from '@/lib/planGates';

// GET — list marketplace services (public, with filters)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || null;
    const search   = searchParams.get('search')   || null;
    const take     = Math.min(parseInt(searchParams.get('take') || '20'), 100);
    const skip     = parseInt(searchParams.get('skip') || '0');

    // Raw query avoids Prisma crashing on portfolioUrls stored as jsonb string
    // instead of native TEXT[] (type mismatch in existing rows).
    const services = await queryRaw(
      `SELECT s.id, s."artistId", s.title, s.description, s.category,
              s.price, s."deliveryDays", s.packages, s.requirements,
              s."isActive", s."createdAt",
              s."totalOrders", s.rating, s."reviewCount",
              a.id AS "artist_id", a.name AS "artist_name",
              a.slug AS "artist_slug", a."photoUrl" AS "artist_photoUrl",
              a."isVerified" AS "artist_isVerified"
         FROM "MarketplaceService" s
         JOIN "Artist" a ON a.id = s."artistId"
        WHERE s."isActive" = true
          ${category ? `AND s.category = '${category.replace(/'/g, "''")}'` : ''}
          ${search   ? `AND (s.title ILIKE '%${search.replace(/'/g, "''")}%' OR s.description ILIKE '%${search.replace(/'/g, "''")}%')` : ''}
        ORDER BY s."createdAt" DESC
        LIMIT ${take} OFFSET ${skip}`,
    );

    // Shape artist sub-object to match what the frontend expects
    const shaped = services.map((s) => ({
      id: s.id, artistId: s.artistId, title: s.title,
      description: s.description, category: s.category,
      price: s.price, deliveryDays: s.deliveryDays,
      packages: s.packages, requirements: s.requirements,
      isActive: s.isActive, createdAt: s.createdAt,
      totalOrders: s.totalOrders ?? 0, rating: s.rating ?? 0,
      reviewCount: s.reviewCount ?? 0,
      artist: {
        id: s.artist_id, name: s.artist_name, slug: s.artist_slug,
        photoUrl: s.artist_photoUrl, isVerified: s.artist_isVerified,
      },
    }));

    return NextResponse.json({ services: shaped });
  } catch (err: any) {
    console.error('[marketplace/services] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — create a new marketplace service (artist only)
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized — no artist profile found' }, { status: 401 });

    // Free-tier cap: 5 active service listings. Pro/Label are unlimited.
    const currentCount = await countActiveServiceListings(user.artist.id);
    const capCheck = await checkFeatureCap(user.artist.id, 'marketplaceServiceListings', currentCount);
    if (!capCheck.ok) return capCheck.response;

    const body = await req.json();
    const { title, description, category, packages, portfolioUrls, requirements } = body;

    if (!title?.trim())    return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!category)         return NextResponse.json({ error: 'Category required' }, { status: 400 });
    if (!packages?.length) return NextResponse.json({ error: 'At least one package required' }, { status: 400 });

    // Validate + coerce packages structure (all fields must be proper types for Prisma)
    const coercedPackages: { name: string; price: number; deliveryDays: number; description: string }[] = [];
    for (const pkg of packages) {
      const price        = Number(pkg.price);
      const deliveryDays = parseInt(String(pkg.deliveryDays), 10);
      if (!pkg.name?.trim()) return NextResponse.json({ error: 'Each package needs a name' }, { status: 400 });
      if (isNaN(price) || price < 0) return NextResponse.json({ error: `Package "${pkg.name}" has invalid price` }, { status: 400 });
      if (isNaN(deliveryDays) || deliveryDays < 1) return NextResponse.json({ error: `Package "${pkg.name}" has invalid delivery days` }, { status: 400 });
      coercedPackages.push({
        name: pkg.name.trim(),
        price,
        deliveryDays,
        description: pkg.description || '',
      });
    }

    const basePrice        = Math.min(...coercedPackages.map(p => p.price));
    const baseDeliveryDays = Math.min(...coercedPackages.map(p => p.deliveryDays));

    // Use raw INSERT to bypass Prisma's String[] vs jsonb mismatch for portfolioUrls
    const id  = require('crypto').randomUUID().replace(/-/g, '').slice(0, 25);
    const now = new Date().toISOString();

    await executeRaw(
      `INSERT INTO "MarketplaceService"
         (id, "artistId", title, description, category, price, "deliveryDays", packages, "portfolioUrls", requirements, "isActive", "totalOrders", "rating", "reviewCount", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::text[], $10, true, 0, 0.0, 0, $11::timestamptz, $11::timestamptz)`,
      id,
      user.artist.id,
      title.trim(),
      description || '',
      category,
      basePrice,
      baseDeliveryDays,
      JSON.stringify(coercedPackages),
      (portfolioUrls || []) as string[],
      requirements || '',
      now,
    );

    // Use raw query — Prisma's findUnique crashes if portfolioUrls was stored
    // as a jsonb string instead of a native TEXT[] (type mismatch in some rows).
    const rows = await queryRaw(
      `SELECT id, "artistId", title, description, category, price, "deliveryDays",
              packages, requirements, "isActive", "createdAt"
       FROM "MarketplaceService" WHERE id = $1`,
      id,
    );
    return NextResponse.json({ service: rows[0] ?? null }, { status: 201 });

  } catch (err: any) {
    console.error('[marketplace/services] POST error:', err?.message, err?.code);
    return NextResponse.json(
      { error: err?.message?.includes('Unique constraint') ? 'A service with that title already exists' : 'Failed to create service' },
      { status: 503 },
    );
  }
}

// PATCH — update own service (or soft-delete with isActive: false)
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { serviceId, ...updates } = body;
    if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });

    const service = await prisma.marketplaceService.findFirst({
      where: { id: serviceId, artistId: user.artist.id },
    });
    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    // Reactivating a previously-deactivated service counts against the cap
    // the same as creating a new one — otherwise Free artists could dodge
    // the limit by deactivating/reactivating instead of deleting.
    if (updates.isActive === true && !service.isActive) {
      const currentCount = await countActiveServiceListings(user.artist.id);
      const capCheck = await checkFeatureCap(user.artist.id, 'marketplaceServiceListings', currentCount);
      if (!capCheck.ok) return capCheck.response;
    }

    const allowed = ['title','description','category','packages','portfolioUrls','requirements','isActive'] as const;
    const data: any = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (key === 'packages' && Array.isArray(updates[key])) {
          // Coerce types when updating packages
          data[key] = updates[key].map((pkg: any) => ({
            name:         pkg.name?.trim() || '',
            price:        Number(pkg.price),
            deliveryDays: parseInt(String(pkg.deliveryDays), 10) || 7,
            description:  pkg.description || '',
          }));
        } else {
          data[key] = updates[key];
        }
      }
    }

    // Also update base price/deliveryDays if packages updated
    if (data.packages?.length) {
      data.price        = Math.min(...data.packages.map((p: any) => p.price));
      data.deliveryDays = Math.min(...data.packages.map((p: any) => p.deliveryDays));
    }

    const updated = await prisma.marketplaceService.update({ where: { id: serviceId }, data });
    return NextResponse.json({ service: updated });
  } catch (err: any) {
    console.error('[marketplace/services] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}
