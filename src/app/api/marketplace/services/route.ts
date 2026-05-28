// ============================================================
// PHASE 2 — src/app/api/marketplace/services/route.ts
// List public services; artists create/manage their own services
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist, requireAuth } from '@/lib/auth';
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
  } catch (err) {
    console.error('[marketplace/services] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — create a new marketplace service (artist only)
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { title, description, category, packages, portfolioUrls, requirements } = body;

    if (!title?.trim())    return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!category)         return NextResponse.json({ error: 'Category required' }, { status: 400 });
    if (!packages?.length) return NextResponse.json({ error: 'At least one package required' }, { status: 400 });

    // Validate packages structure
    for (const pkg of packages) {
      if (!pkg.name || pkg.price == null || !pkg.deliveryDays) {
        return NextResponse.json(
          { error: 'Each package needs name, price, and deliveryDays' },
          { status: 400 }
        );
      }
    }

    // Derive the base price from the lowest-priced package
    const basePrice: number = Math.min(...packages.map((p: any) => Number(p.price)));
    const baseDeliveryDays: number = Math.min(...packages.map((p: any) => Number(p.deliveryDays)));

    const service = await prisma.marketplaceService.create({
      data: {
        artistId: user.artist.id,
        title: title.trim(),
        description: description || '',
        category,
        price: basePrice,
        deliveryDays: baseDeliveryDays,
        packages,
        portfolioUrls: portfolioUrls || [],
        requirements: requirements || '',
      },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (err: any) {
    console.error('[marketplace/services] POST error:', err?.message);
    return NextResponse.json({ error: 'Failed to create service' }, { status: 503 });
  }
}

// PATCH — update own service
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

    const allowed = ['title','description','category','packages','portfolioUrls','requirements','isActive'];
    const data: any = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) data[key] = updates[key];
    }

    const updated = await prisma.marketplaceService.update({ where: { id: serviceId }, data });
    return NextResponse.json({ service: updated });
  } catch (err: any) {
    console.error('[marketplace/services] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}
