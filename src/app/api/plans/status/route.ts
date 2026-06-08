// ============================================================
// src/app/api/plans/status/route.ts
// Returns the current plan and subscription status for the logged-in artist.
// Uses $queryRaw to bypass Prisma's singleton object cache — ensures
// plan changes made directly in the DB are always reflected immediately.
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

    // $queryRaw bypasses Prisma's internal query result cache and goes
    // straight to the DB — essential after manual SQL updates via Supabase.
    const rows = await prisma.$queryRaw<
      Array<{ planSlug: string; planExpiresAt: Date | null }>
    >`
      SELECT "planSlug", "planExpiresAt"
      FROM "Artist"
      WHERE id = ${user.artist.id}
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const artist = rows[0];
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
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[plans/status] error:', err?.message);
    return NextResponse.json({ error: 'Failed to load plan' }, { status: 500 });
  }
}
