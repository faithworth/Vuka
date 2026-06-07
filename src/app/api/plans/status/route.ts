// ============================================================
// src/app/api/plans/status/route.ts
// Returns the current plan and subscription status for the logged-in artist.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getEffectivePlan } from '@/lib/plans';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { planSlug: true, planExpiresAt: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const effectivePlan = getEffectivePlan(artist.planSlug, artist.planExpiresAt);

    // Get latest subscription record
    const subscription = await (prisma as any).artistPlanSubscription.findFirst({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      planSlug: effectivePlan.slug,
      planName: effectivePlan.name,
      platformFeePct: effectivePlan.platformFeePct,
      artistSharePct: effectivePlan.artistSharePct,
      priceZAR: effectivePlan.priceZAR,
      features: effectivePlan.features,
      planExpiresAt: artist.planExpiresAt,
      subscription: subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelledAt: subscription.cancelledAt,
      } : null,
    });
  } catch (err: any) {
    console.error('[plans/status] error:', err?.message);
    return NextResponse.json({ error: 'Failed to load plan' }, { status: 500 });
  }
}
