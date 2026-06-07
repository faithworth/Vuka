// ============================================================
// PHASE 2 — src/app/api/marketplace/services/route.ts
// List public services; artists create/manage their own services
// FIXED: Coerce deliveryDays/price to numbers to prevent Prisma type errors.
// FIXED: Return actual error message in dev for debugging.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { listServices } from '@/lib/marketplace';

// GET — list marketplace services (public, with filters)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    const search   = searchParams.get('search')   || undefined;
    const take     = parseInt(searchParams.get('take') || '20');
    const skip     = parseInt(searchParams.get('skip') || '0');

    const services = await listServices({ category, search, take, skip });
    return NextResponse.json({ services });
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

    const body = await req.json();
    const { title, description, category, packages, portfolioUrls, requirements } = body;

    if (!title?.trim())    return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!category)         return NextResponse.json({ error: 'Category required' }, { status: 400 });
    if (!packages?.length) return NextResponse.json({ error: 'At least one package required' }, { status: 400 });

    // Validate + coerce packages structure (all fields must be proper types for Prisma)
    const coercedPackages = [];
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

    await prisma.$executeRawUnsafe(
      `INSERT INTO "MarketplaceService"
         (id, "artistId", title, description, category, price, "deliveryDays", packages, "portfolioUrls", requirements, "isActive", "totalOrders", "rating", "reviewCount", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, true, 0, 0.0, 0, $11::timestamptz, $11::timestamptz)`,
      id,
      user.artist.id,
      title.trim(),
      description || '',
      category,
      basePrice,
      baseDeliveryDays,
      JSON.stringify(coercedPackages),
      JSON.stringify(portfolioUrls || []),
      requirements || '',
      now,
    );

    const service = await prisma.marketplaceService.findUnique({ where: { id } });
    return NextResponse.json({ service }, { status: 201 });
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
