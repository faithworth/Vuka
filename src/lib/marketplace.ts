// ============================================================
// src/lib/marketplace.ts
// Rewritten to use ONLY actual database columns (verified against
// prisma/migrations/phase2_creator_economy/migration.sql).
// MarketplaceOrder: buyerUserId, sellerArtistId, packageName, packagePrice,
//                    status, requirements, deliverables, deliveryDays, dueAt,
//                    platformFee, netAmount
// MarketplaceDispute: orderId, raisedByUserId, reason, status
// ServiceReview: orderId, serviceId, reviewerUserId, rating, comment
// RevenueRecord: type, amount, platformFee, netAmount, period
// ============================================================

import prisma from './prisma';
import { platformFee as calcFee, artistNet as calcNet, getPlan } from './plans';

function getPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Create Order ──────────────────────────────────────────────

export async function createMarketplaceOrder(params: {
  serviceId: string;
  buyerUserId: string;
  requirements?: string;
  packageName?: string;
}) {
  const service = await prisma.marketplaceService.findUnique({
    where: { id: params.serviceId },
    include: { artist: true },
  });
  if (!service || !service.isActive) throw new Error('Service not available');

  const buyer = await prisma.user.findUnique({ where: { id: params.buyerUserId }, include: { artist: true } });
  if (buyer?.artist?.id === service.artistId) throw new Error('Cannot order your own service');

  // Derive price/package server-side — never trust client input for payments.
  const packages = Array.isArray(service.packages) ? (service.packages as any[]) : [];
  let price: number;
  let resolvedPackageName: string;
  let deliveryDays: number;
  if (packages.length > 0) {
    const pkg = params.packageName ? packages.find(p => p.name === params.packageName) : packages[0];
    if (!pkg) throw new Error('Package not found');
    price = Number(pkg.price);
    resolvedPackageName = pkg.name;
    deliveryDays = parseInt(pkg.deliveryDays, 10) || service.deliveryDays || 7;
  } else {
    price = Number(service.price);
    resolvedPackageName = 'Standard';
    deliveryDays = service.deliveryDays || 7;
  }

  const platformFee = calcFee(price, service.artist.planSlug, service.artist.planExpiresAt, service.artist.lifetimeGrossSales);
  const netAmount    = calcNet(price, service.artist.planSlug, service.artist.planExpiresAt, service.artist.lifetimeGrossSales);

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + deliveryDays);

  return prisma.marketplaceOrder.create({
    data: {
      serviceId:      params.serviceId,
      buyerUserId:    params.buyerUserId,
      sellerArtistId: service.artistId,
      packageName:    resolvedPackageName,
      packagePrice:   price,
      currency:       service.currency,
      requirements:   params.requirements || '',
      status:         'pending',
      deliveryDays,
      dueAt,
      platformFee,
      netAmount,
    },
  });
}

// ── Deliver Order ─────────────────────────────────────────────

export async function deliverOrder(
  orderId: string,
  sellerArtistId: string,
  deliverables: string[],
) {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.sellerArtistId !== sellerArtistId) throw new Error('Unauthorized');
  if (order.status !== 'active') throw new Error(`Order is ${order.status}, cannot deliver`);

  return prisma.marketplaceOrder.update({
    where: { id: orderId },
    data: { status: 'delivered', deliverables, deliveredAt: new Date() },
  });
}

// ── Request Revision ──────────────────────────────────────────

export async function requestRevision(orderId: string, buyerUserId: string) {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: { service: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.buyerUserId !== buyerUserId) throw new Error('Unauthorized');
  if (order.status !== 'delivered') throw new Error('Order has not been delivered yet');

  return prisma.marketplaceOrder.update({
    where: { id: orderId },
    data: { status: 'revision' },
  });
}

// ── Complete Order ────────────────────────────────────────────

export async function completeOrder(orderId: string, buyerUserId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.buyerUserId !== buyerUserId) throw new Error('Unauthorized');
    if (order.status !== 'delivered') throw new Error('Order must be delivered to complete');

    const updated = await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'complete', completedAt: new Date() },
    });

    // Use the fee/net already locked in on the order at checkout time —
    // recomputing here could disagree if the artist's plan or lifetime
    // sales changed between order creation and completion.
    const platformFee = order.platformFee;
    const netAmount    = order.netAmount;

    // Release payout to seller (truthful: pending until processed)
    await tx.artistPayout.create({
      data: {
        artistId:  order.sellerArtistId,
        amount:    netAmount,
        method:    'bank',
        currency:  order.currency,
        status:    'pending',
        notes:     `Marketplace order completed`,
        reference: orderId,
      },
    });

    // Revenue record
    await tx.revenueRecord.create({
      data: {
        artistId:    order.sellerArtistId,
        type:        'marketplace',
        amount:      order.packagePrice,
        platformFee,
        netAmount,
        period:      getPeriod(),
        currency:    order.currency,
      },
    });

    return updated;
  });
}

// ── Raise Dispute ─────────────────────────────────────────────

export async function raiseDispute(
  orderId: string,
  raisedByUserId: string,
  reason: string,
) {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');

  const sellerUser = await prisma.artist.findUnique({ where: { id: order.sellerArtistId }, select: { userId: true } });
  const isParty = order.buyerUserId === raisedByUserId || sellerUser?.userId === raisedByUserId;
  if (!isParty) throw new Error('Only order parties can raise a dispute');

  return prisma.$transaction(async (tx) => {
    await tx.marketplaceOrder.update({ where: { id: orderId }, data: { status: 'disputed' } });
    return tx.marketplaceDispute.create({
      data: { orderId, raisedByUserId, reason, status: 'open' },
    });
  });
}

// ── Submit Review ─────────────────────────────────────────────

export async function submitReview(
  orderId: string,
  reviewerUserId: string,
  rating: number,
  comment?: string,
) {
  if (rating < 1 || rating > 5) throw new Error('Rating must be 1–5');
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.buyerUserId !== reviewerUserId) throw new Error('Only the buyer can review');
  if (order.status !== 'complete') throw new Error('Can only review completed orders');

  return prisma.serviceReview.create({
    data: {
      orderId,
      serviceId:      order.serviceId,
      reviewerUserId,
      rating,
      comment:        comment || '',
    },
  });
}

// ── List Services ─────────────────────────────────────────────

export async function listServices(filters: {
  category?: string;
  search?: string;
  take?: number;
  skip?: number;
}) {
  const where: Record<string, unknown> = { isActive: true };
  if (filters.category) where.category = filters.category;
  if (filters.search) {
    where.OR = [
      { title:       { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return prisma.marketplaceService.findMany({
    where,
    include: {
      artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true } },
      _count: { select: { orders: true, reviews: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: filters.take ?? 20,
    skip: filters.skip ?? 0,
  });
}
