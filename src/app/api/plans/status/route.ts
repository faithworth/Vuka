// ============================================================
// src/app/api/plans/status/route.ts
// Returns the current plan and subscription status for the logged-in artist.
// Uses $queryRaw to bypass Prisma's singleton object cache — ensures
// plan changes made directly in the DB are always reflected immediately.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getEffectivePlan, platformFeeRate } from '@/lib/plans';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // $queryRaw bypasses Prisma's internal query result cache and goes
    // straight to the DB — essential after manual SQL updates via Supabase.
    const rows = await prisma.$queryRaw<
      Array<{ planSlug: string; planExpiresAt: Date | null; lifetimeGrossSales: number | null }>
    >`
      SELECT "planSlug", "planExpiresAt", "lifetimeGrossSales"
      FROM "Artist"
      WHERE id = ${user.artist.id}
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const artist = rows[0];
    const lifetimeGrossSales = artist.lifetimeGrossSales ?? 0;
    const effectivePlan = getEffectivePlan(artist.planSlug, artist.planExpiresAt);

    // The plan's static platformFeePct/artistSharePct is only the *starting*
    // rate for Free-tier artists — it steps down automatically as
    // lifetimeGrossSales grows (10% → 9% → 8.5%). Every UI that shows "you
    // earn X%" must use this actual, current, per-artist number — never the
    // static plan default — or it lies to Free-tier artists who've grown
    // past the entry rate, and to anyone on a plan other than Free.
    const effectiveFeeRate      = platformFeeRate(artist.planSlug, artist.planExpiresAt, lifetimeGrossSales);
    const effectivePlatformFeePct = Math.round(effectiveFeeRate * 1000) / 10; // e.g. 8.5
    const effectiveArtistSharePct = Math.round((1 - effectiveFeeRate) * 1000) / 10; // e.g. 91.5

    // Get latest subscription record — wrapped in try/catch because the
    // artist_plan_subscriptions table may not be migrated yet; a missing
    // table must never 500 this route.
    let subscription: { status: string; currentPeriodEnd: Date | null; cancelledAt: Date | null } | null = null;
    try {
      subscription = await prisma.artistPlanSubscription.findFirst({
        where: { artistId: user.artist.id },
        orderBy: { createdAt: 'desc' },
      });
    } catch (subErr: any) {
      console.warn('[plans/status] subscription lookup skipped:', subErr?.message?.split('\n')[0]);
    }

    return NextResponse.json({
      planSlug: effectivePlan.slug,
      planName: effectivePlan.name,
      // Static plan defaults — kept for reference (e.g. plan comparison UI)
      platformFeePct: effectivePlan.platformFeePct,
      artistSharePct: effectivePlan.artistSharePct,
      // Actual current rate for THIS artist right now — always use these
      // for "you earn X% of every sale" style copy.
      effectivePlatformFeePct,
      effectiveArtistSharePct,
      lifetimeGrossSales,
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
