// ============================================================
// PHASE 2 — src/lib/creator.ts
// Creator Economy: subscriptions, memberships, storefronts,
// exclusive content, analytics, revenue tracking.
// ============================================================

import prisma from './prisma';
import { Prisma } from '@prisma/client';

// ── Subscription Tier Management ──────────────────────────────

export async function getArtistTiers(artistId: string) {
  return prisma.creatorSubscriptionTier.findMany({
    where: { artistId, isActive: true },
    include: {
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createTier(
  artistId: string,
  data: {
    name: string;
    description?: string;
    priceMonthly: number;
    priceYearly?: number;
    currency?: string;
    perks?: { icon: string; title: string; description: string }[];
    maxSubscribers?: number;
    sortOrder?: number;
  }
) {
  // Schema has: price (Float), interval (String), perks (String[]), currency (String)
  // priceMonthly maps to price; perks objects serialized to strings; priceYearly/sortOrder/maxSubscribers not in schema
  const perksStrings: string[] = (data.perks || []).map((p) =>
    typeof p === 'string' ? p : `${p.icon} ${p.title}: ${p.description}`
  );

  return prisma.creatorSubscriptionTier.create({
    data: {
      artistId,
      name: data.name,
      description: data.description || '',
      price: data.priceMonthly,
      interval: 'monthly',
      currency: data.currency || 'ZAR',
      perks: perksStrings,
    },
  });
}

// ── Membership Lifecycle ──────────────────────────────────────

export async function createMembership(params: {
  userId: string;
  tierId: string;
  artistId: string;
  billingInterval: 'monthly' | 'yearly';
  payfastToken?: string;
  stripeSubId?: string;
}) {
  const tier = await prisma.creatorSubscriptionTier.findUnique({
    where: { id: params.tierId },
  });
  if (!tier) throw new Error('Tier not found');

  const now = new Date();
  const periodEnd = new Date(now);
  if (params.billingInterval === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const existing = await prisma.creatorMembership.findFirst({
    where: { userId: params.userId, tierId: params.tierId },
  });
  if (existing) {
    return prisma.creatorMembership.update({
      where: { id: existing.id },
      data: { status: 'active', expiresAt: periodEnd },
    });
  }
  return prisma.creatorMembership.create({
    data: {
      userId:    params.userId,
      tierId:    params.tierId,
      artistId:  params.artistId,
      status:    'active',
      expiresAt: periodEnd,
    },
  });
}

export async function cancelMembership(userId: string, tierId: string) {
  const membership = await prisma.creatorMembership.findFirst({ where: { userId, tierId } });
  if (!membership) throw new Error('Membership not found');
  return prisma.creatorMembership.update({
    where: { id: membership.id },
    data: { status: 'cancelled' },
  });
}

export async function renewMembership(membershipId: string, amount: number) {
  const membership = await prisma.creatorMembership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) throw new Error('Membership not found');

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return prisma.creatorMembership.update({
    where: { id: membershipId },
    data: {
      status: 'active',
      expiresAt: periodEnd,
    },
  });
}

// ── Entitlement Check ─────────────────────────────────────────
// Returns whether a user can access a piece of exclusive content

export async function checkContentEntitlement(
  userId: string,
  contentId: string
): Promise<boolean> {
  const content = await prisma.exclusiveContent.findUnique({
    where: { id: contentId },
  });
  if (!content) return false;
  if (!content.isPublished) return false;
  if (content.isFreePreview) return true;

  // Check if user has an active membership to this artist
  const activeMembership = await prisma.creatorMembership.findFirst({
    where: {
      userId,
      artistId: content.artistId,
      status: 'active',
      expiresAt: { gte: new Date() },
    },
  });
  if (!activeMembership) return false;

  // If content has specific tier restrictions, check against them
  const tierIds = content.accessTierIds as string[];
  if (tierIds.length === 0) return true; // all active members

  return tierIds.includes(activeMembership.tierId);
}

// ── Creator Analytics ─────────────────────────────────────────

export async function getCreatorAnalytics(artistId: string) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  const [
    activeMembers,
    beatSalesThisMonth,
    releaseSalesThisMonth,
    pendingPayouts,
    recentRevenue,
  ] = await Promise.all([
    prisma.creatorMembership.count({
      where: { artistId, status: 'active', expiresAt: { gte: now } },
    }),
    prisma.purchase.aggregate({
      where: {
        status: 'confirmed',
        itemType: 'beat',
        beat: { artistId },
        createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.purchase.aggregate({
      where: {
        status: 'confirmed',
        itemType: 'release',
        release: { artistId },
        createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.artistPayout.aggregate({
      where: { artistId, status: 'pending' },
      _sum: { amount: true },
    }),
    prisma.revenueRecord.findMany({
      where: { artistId },
      orderBy: { period: 'desc' },
      take: 12,
    }),
  ]);

  return {
    activeMembers,
    totalMemberRevenue: 0,
    beatSalesThisMonth: {
      revenue: beatSalesThisMonth._sum.netAmount || 0,
      count: beatSalesThisMonth._count,
    },
    releaseSalesThisMonth: {
      revenue: releaseSalesThisMonth._sum.netAmount || 0,
      count: releaseSalesThisMonth._count,
    },
    pendingPayouts: pendingPayouts._sum.amount || 0,
    revenueHistory: recentRevenue,
    period: thisMonth,
  };
}

// ── Revenue Record Upsert ─────────────────────────────────────
// Called after each confirmed purchase to roll up revenue

export async function upsertRevenueRecord(
  artistId: string,
  period: string,
  delta: {
    type?: string;
    amount?: number;
    platformFee?: number;
    netAmount?: number;
    purchaseId?: string;
  }
) {
  if (!delta.amount || delta.amount <= 0) return null;
  return prisma.revenueRecord.create({
    data: {
      artistId,
      period,
      type:        delta.type        || 'other',
      amount:      delta.amount      || 0,
      platformFee: delta.platformFee || 0,
      netAmount:   delta.netAmount   || 0,
      purchaseId:  delta.purchaseId,
      currency:    'ZAR',
    },
  });
}

export async function getOrCreateStorefront(artistId: string) {
  return prisma.creatorStorefront.upsert({
    where: { artistId },
    create: { artistId },
    update: {},
  });
}

// Accepts both legacy field names (heroHeadline, heroSubtext, isLive, etc.)
// and schema field names (headline, description, theme, sections, isPublic).
// Maps everything to actual schema columns before writing.
export async function updateStorefront(
  artistId: string,
  data: Record<string, unknown>
) {
  const mapped: {
    headline?: string;
    description?: string;
    theme?: string;
    sections?: Prisma.InputJsonValue;
    isPublic?: boolean;
  } = {};

  if (data.headline     !== undefined) mapped.headline    = String(data.headline);
  if (data.heroHeadline !== undefined) mapped.headline    = String(data.heroHeadline);
  if (data.description  !== undefined) mapped.description = String(data.description);
  if (data.heroSubtext  !== undefined) mapped.description = String(data.heroSubtext);
  if (data.theme        !== undefined) mapped.theme       = String(data.theme);
  if (data.accentColor  !== undefined) mapped.theme       = String(data.accentColor);
  if (data.sections     !== undefined && data.sections !== null) mapped.sections = data.sections as Prisma.InputJsonValue;
  if (data.isPublic     !== undefined) mapped.isPublic    = Boolean(data.isPublic);
  if (data.isLive       !== undefined) mapped.isPublic    = Boolean(data.isLive);

  return prisma.creatorStorefront.upsert({
    where: { artistId },
    create: { artistId, ...mapped },
    update: mapped,
  });
}
