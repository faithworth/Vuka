// ============================================================
// PHASE 2 — src/lib/creator.ts
// Creator Economy: subscriptions, memberships, storefronts,
// exclusive content, analytics, revenue tracking.
// ============================================================

import prisma from './prisma';

// ── Subscription Tier Management ──────────────────────────────

export async function getArtistTiers(artistId: string) {
  return prisma.creatorSubscriptionTier.findMany({
    where: { artistId, isActive: true },
    include: {
      _count: { select: { memberships: true } },
    },
    orderBy: { sortOrder: 'asc' },
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
  return prisma.creatorSubscriptionTier.create({
    data: {
      artistId,
      name: data.name,
      description: data.description || '',
      priceMonthly: data.priceMonthly,
      priceYearly: data.priceYearly,
      currency: data.currency || 'ZAR',
      perks: data.perks || [],
      maxSubscribers: data.maxSubscribers,
      sortOrder: data.sortOrder || 0,
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

  // Check subscriber cap
  if (tier.maxSubscribers) {
    const current = await prisma.creatorMembership.count({
      where: { tierId: params.tierId, status: 'active' },
    });
    if (current >= tier.maxSubscribers) {
      throw new Error('This tier has reached its subscriber limit');
    }
  }

  const now = new Date();
  const periodEnd = new Date(now);
  if (params.billingInterval === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  return prisma.creatorMembership.upsert({
    where: { userId_tierId: { userId: params.userId, tierId: params.tierId } },
    create: {
      userId: params.userId,
      tierId: params.tierId,
      artistId: params.artistId,
      status: 'active',
      billingInterval: params.billingInterval,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      payfastToken: params.payfastToken,
      stripeSubId: params.stripeSubId,
    },
    update: {
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      payfastToken: params.payfastToken,
      stripeSubId: params.stripeSubId,
    },
  });
}

export async function cancelMembership(userId: string, tierId: string) {
  return prisma.creatorMembership.update({
    where: { userId_tierId: { userId, tierId } },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });
}

export async function renewMembership(membershipId: string, amount: number) {
  const membership = await prisma.creatorMembership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) throw new Error('Membership not found');

  const now = new Date();
  const periodEnd = new Date(now);
  if (membership.billingInterval === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  return prisma.creatorMembership.update({
    where: { id: membershipId },
    data: {
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      lastPaymentAt: now,
      lastPaymentAmount: amount,
      totalPaid: { increment: amount },
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
      currentPeriodEnd: { gte: new Date() },
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
    totalMemberRevenue,
    beatSalesThisMonth,
    releaseSalesThisMonth,
    pendingPayouts,
    recentRevenue,
  ] = await Promise.all([
    prisma.creatorMembership.count({
      where: { artistId, status: 'active', currentPeriodEnd: { gte: now } },
    }),
    prisma.creatorMembership.aggregate({
      where: { artistId },
      _sum: { totalPaid: true },
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
      _sum: { netAmount: true },
    }),
    prisma.revenueRecord.findMany({
      where: { artistId },
      orderBy: { period: 'desc' },
      take: 12,
    }),
  ]);

  return {
    activeMembers,
    totalMemberRevenue: totalMemberRevenue._sum.totalPaid || 0,
    beatSalesThisMonth: {
      revenue: beatSalesThisMonth._sum.netAmount || 0,
      count: beatSalesThisMonth._count,
    },
    releaseSalesThisMonth: {
      revenue: releaseSalesThisMonth._sum.netAmount || 0,
      count: releaseSalesThisMonth._count,
    },
    pendingPayouts: pendingPayouts._sum.netAmount || 0,
    revenueHistory: recentRevenue,
    period: thisMonth,
  };
}

// ── Revenue Record Upsert ─────────────────────────────────────
// Called after each confirmed purchase to roll up revenue

export async function upsertRevenueRecord(
  artistId: string,
  period: string, // YYYY-MM
  delta: {
    beatSales?: number;
    releaseSales?: number;
    subscriptions?: number;
    marketplace?: number;
    tips?: number;
    distribution?: number;
    other?: number;
    platformFees?: number;
  }
) {
  const grossDelta =
    (delta.beatSales || 0) +
    (delta.releaseSales || 0) +
    (delta.subscriptions || 0) +
    (delta.marketplace || 0) +
    (delta.tips || 0) +
    (delta.distribution || 0) +
    (delta.other || 0);

  const existing = await prisma.revenueRecord.findUnique({
    where: { artistId_period: { artistId, period } },
  });

  if (existing) {
    const newGross = existing.grossRevenue + grossDelta;
    const newFees  = existing.platformFees + (delta.platformFees || 0);
    await prisma.revenueRecord.update({
      where: { artistId_period: { artistId, period } },
      data: {
        beatSales:     { increment: delta.beatSales     || 0 },
        releaseSales:  { increment: delta.releaseSales  || 0 },
        subscriptions: { increment: delta.subscriptions || 0 },
        marketplace:   { increment: delta.marketplace   || 0 },
        tips:          { increment: delta.tips          || 0 },
        distribution:  { increment: delta.distribution  || 0 },
        other:         { increment: delta.other         || 0 },
        grossRevenue:  { increment: grossDelta },
        platformFees:  { increment: delta.platformFees  || 0 },
        netRevenue:    { increment: grossDelta - (delta.platformFees || 0) },
        pendingAmount: { increment: grossDelta - (delta.platformFees || 0) },
      },
    });
  } else {
    const gross = grossDelta;
    const fees  = delta.platformFees || 0;
    await prisma.revenueRecord.create({
      data: {
        artistId,
        period,
        beatSales:     delta.beatSales     || 0,
        releaseSales:  delta.releaseSales  || 0,
        subscriptions: delta.subscriptions || 0,
        marketplace:   delta.marketplace   || 0,
        tips:          delta.tips          || 0,
        distribution:  delta.distribution  || 0,
        other:         delta.other         || 0,
        grossRevenue:  gross,
        platformFees:  fees,
        netRevenue:    gross - fees,
        pendingAmount: gross - fees,
        payoutAmount:  0,
      },
    });
  }
}

// ── Storefront Management ─────────────────────────────────────

export async function getOrCreateStorefront(artistId: string) {
  return prisma.creatorStorefront.upsert({
    where: { artistId },
    create: { artistId },
    update: {},
  });
}

export async function updateStorefront(
  artistId: string,
  data: Partial<{
    heroHeadline: string;
    heroSubtext: string;
    heroImageUrl: string;
    accentColor: string;
    featuredBeats: string[];
    featuredReleases: string[];
    featuredServices: string[];
    metaTitle: string;
    metaDescription: string;
    isLive: boolean;
  }>
) {
  return prisma.creatorStorefront.upsert({
    where: { artistId },
    create: { artistId, ...data },
    update: data,
  });
}
