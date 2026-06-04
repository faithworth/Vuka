// ============================================================
// src/app/api/creator/memberships/route.ts
// Fan membership: subscribe, cancel, list active memberships
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createMembership, cancelMembership } from '@/lib/creator';

// GET — list caller's active memberships (fan view)
export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const memberships = await prisma.creatorMembership.findMany({
      where: { userId: user.id, status: 'active' },
      include: {
        tier: true,
        artist: { select: { id: true, name: true, slug: true, photoUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ memberships });
  } catch (err: any) {
    console.error('[creator/memberships] GET error:', err?.message ?? err);
    return NextResponse.json({ memberships: [] }, { status: 200 });
  }
}

// POST — subscribe to a tier
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { tierId, artistId, billingInterval, payfastToken } = await req.json();
    if (!tierId) return NextResponse.json({ error: 'tierId required' }, { status: 400 });
    if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });

    const membership = await createMembership({
      userId: user.id,
      tierId,
      artistId,
      billingInterval: billingInterval || 'monthly',
      payfastToken,
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (err: any) {
    console.error('[creator/memberships] POST error:', err?.message);
    const code = err?.message?.includes('limit') ? 409 : 503;
    return NextResponse.json({ error: err?.message || 'Failed to create membership' }, { status: code });
  }
}

// DELETE — cancel membership
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tierId = searchParams.get('tierId');
    if (!tierId) return NextResponse.json({ error: 'tierId required' }, { status: 400 });

    const membership = await prisma.creatorMembership.findFirst({
      where: { userId: user.id, tierId },
    });
    if (!membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

    await cancelMembership(user.id, tierId);
    return NextResponse.json({ ok: true, message: 'Membership cancelled. Access continues until end of billing period.' });
  } catch (err: any) {
    console.error('[creator/memberships] DELETE error:', err?.message);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 503 });
  }
}
