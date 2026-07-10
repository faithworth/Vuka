// ============================================================
// src/lib/planGates.ts
// ============================================================
// Shared server-side plan enforcement helpers. Import from here in
// every API route that needs to check plan tier or a feature cap —
// never re-derive these checks locally in a route file, so gating
// logic can't drift out of sync across routes.
//
// Two kinds of gates:
//   1. Hard tier gates  — planAtLeast() — for true Label-exclusive
//      capabilities (multi-artist roster, bulk payouts, white-label).
//   2. Soft feature caps — checkFeatureCap() — Free keeps access to
//      the feature, just capped at a small number (services listed,
//      industry inquiries/month).
//
// Always re-fetch planSlug/planExpiresAt fresh from the DB here
// rather than trusting a client-supplied or session-cached value —
// plans change (upgrade/downgrade/expiry) and the session may be stale.
// ============================================================

import { NextResponse } from 'next/server';
import prisma from './prisma';
import { planAtLeast, featureCapFor, FEATURE_CAPS } from './plans';

export interface PlanGateResult<T> {
  ok: true;
  data: T;
}
export interface PlanGateError {
  ok: false;
  response: NextResponse;
}

/**
 * Fetch an artist's current plan fields fresh from the DB.
 * Never trust a stale session value for gating decisions.
 */
export async function getFreshArtistPlan(artistId: string) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { planSlug: true, planExpiresAt: true },
  });
  return {
    planSlug: artist?.planSlug ?? 'free',
    planExpiresAt: artist?.planExpiresAt ?? null,
  };
}

/**
 * Hard gate: require the artist's effective plan to be at least `minSlug`.
 * Returns a 403 NextResponse if not — call sites should `return` it directly.
 */
export async function requirePlanAtLeast(
  artistId: string,
  minSlug: 'pro' | 'label',
): Promise<PlanGateError | PlanGateResult<{ planSlug: string }>> {
  const { planSlug, planExpiresAt } = await getFreshArtistPlan(artistId);
  if (!planAtLeast(planSlug, planExpiresAt, minSlug)) {
    const label = minSlug === 'label' ? 'Label' : 'Pro';
    return {
      ok: false,
      response: NextResponse.json(
        { error: `This feature requires the Vuka Music ${label} plan or higher. Upgrade at /pricing.` },
        { status: 403 },
      ),
    };
  }
  return { ok: true, data: { planSlug } };
}

/**
 * Soft gate: check a Free-tier quantity cap for a feature.
 * `currentCount` is the count of existing items (caller supplies the query —
 * kept here so this file doesn't need to know every schema's shape).
 * Returns a 403 NextResponse if the cap would be exceeded.
 */
export async function checkFeatureCap(
  artistId: string,
  feature: keyof typeof FEATURE_CAPS,
  currentCount: number,
): Promise<PlanGateError | PlanGateResult<{ cap: number; planSlug: string }>> {
  const { planSlug, planExpiresAt } = await getFreshArtistPlan(artistId);
  const cap = featureCapFor(feature, planSlug, planExpiresAt);
  if (currentCount >= cap) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `You've reached the Free plan limit of ${cap} for this feature. Upgrade at /pricing for unlimited access.`,
          cap,
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, data: { cap, planSlug } };
}

/**
 * Count active marketplace service listings for an artist.
 * Uses a plain Prisma count() (not the raw-query helpers used elsewhere in
 * this feature) because COUNT never selects the `portfolioUrls` column, so
 * it never touches the jsonb/TEXT[] type mismatch that forces raw SQL
 * for the GET/POST handlers in /api/marketplace/services.
 */
export async function countActiveServiceListings(artistId: string): Promise<number> {
  return prisma.marketplaceService.count({
    where: { artistId, isActive: true },
  });
}

/** Count industry inquiries an artist has sent so far this calendar month. */
export async function countIndustryInquiriesThisMonth(artistId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return prisma.serviceInquiry.count({
    where: { artistId, createdAt: { gte: monthStart } },
  });
}
