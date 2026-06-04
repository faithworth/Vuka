// ============================================================
// PHASE 2 — src/app/api/creator/tiers/route.ts
// Artist subscription tier management
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { createTier, getArtistTiers } from '@/lib/creator';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tiers = await getArtistTiers(user.artist.id);
    return NextResponse.json({ tiers });
  } catch (err) {
    console.error('[creator/tiers] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Limit: 5 tiers per artist
    const existing = await prisma.creatorSubscriptionTier.count({
      where: { artistId: user.artist.id, isActive: true },
    });
    if (existing >= 5) {
      return NextResponse.json({ error: 'Maximum 5 subscription tiers allowed' }, { status: 409 });
    }

    const body = await req.json();
    const { name, description, priceMonthly, priceYearly, perks, maxSubscribers, sortOrder } = body;

    if (!name?.trim())     return NextResponse.json({ error: 'Tier name required' }, { status: 400 });
    if (!priceMonthly || priceMonthly < 1) {
      return NextResponse.json({ error: 'Monthly price must be at least R1' }, { status: 400 });
    }

    const tier = await createTier(user.artist.id, {
      name: name.trim(),
      description: description || '',
      priceMonthly: parseFloat(priceMonthly),
      priceYearly:  priceYearly ? parseFloat(priceYearly) : undefined,
      perks:        perks || [],
      maxSubscribers: maxSubscribers ? parseInt(maxSubscribers) : undefined,
      sortOrder:    sortOrder || existing,
    });

    return NextResponse.json({ tier }, { status: 201 });
  } catch (err: any) {
    console.error('[creator/tiers] POST error:', err?.message);
    return NextResponse.json({ error: 'Failed to create tier' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { tierId, ...updates } = body;
    if (!tierId) return NextResponse.json({ error: 'tierId required' }, { status: 400 });

    const tier = await prisma.creatorSubscriptionTier.findFirst({
      where: { id: tierId, artistId: user.artist.id },
    });
    if (!tier) return NextResponse.json({ error: 'Tier not found' }, { status: 404 });

    // FIX: map priceMonthly → price (the actual Prisma schema field)
    // The schema has `price Float` not `priceMonthly`.
    // priceYearly and maxSubscribers/sortOrder don't exist on the model — skip them gracefully.
    const allowed = ['name', 'description', 'priceMonthly', 'perks', 'isActive'] as const;
    const data: any = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (key === 'priceMonthly') {
          // Map to the schema field name
          data['price'] = parseFloat(updates[key]);
        } else {
          data[key] = updates[key];
        }
      }
    }

    const updated = await prisma.creatorSubscriptionTier.update({
      where: { id: tierId },
      data,
    });

    return NextResponse.json({ tier: updated });
  } catch (err: any) {
    console.error('[creator/tiers] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}
