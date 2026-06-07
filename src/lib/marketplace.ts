// ============================================================
// src/lib/marketplace.ts
// Rewritten to use ONLY actual schema fields.
// MarketplaceOrder: buyerId, sellerId, amount, status, requirements, deliverables, deadline
// MarketplaceDispute: orderId, raisedBy, reason, status
// ServiceReview: orderId, serviceId, reviewerId, rating, body
// RevenueRecord: type, amount, platformFee, netAmount, period
// ============================================================

import prisma from './prisma';
import { platformFee as calcFee, getPlan } from './plans';

// Marketplace uses Free plan rate (15%) — sellers don't have subscriptions
const MARKETPLACE_PLAN = 'free';

function getPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Create Order ──────────────────────────────────────────────

export async function createMarketplaceOrder(params: {
  serviceId: string;
  buyerUserId: string;
  requirements?: string;
}) {
  const service = await prisma.marketplaceService.findUnique({
    where: { id: params.serviceId },
    include: { artist: true },
  });
  if (!service || !service.isActive) throw new Error('Service not available');

  const buyer = await prisma.user.findUnique({ where: { id: params.buyerUserId }, include: { artist: true } });
  if (buyer?.artist?.id === service.artistId) throw new Error('Cannot order your own service');

  const platformFee = calcFee(service.price, MARKETPLACE_PLAN);
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + service.deliveryDays);

  return prisma.marketplaceOrder.create({
    data: {
      serviceId:    params.serviceId,
      buyerId:      params.buyerUserId,
      sellerId:     service.artistId,
      amount:       service.price,
      currency:     service.currency,
      requirements: params.requirements || '',
      status:       'pending',
      deadline,
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
  if (order.sellerId !== sellerArtistId) throw new Error('Unauthorized');
  if (order.status !== 'active') throw new Error(`Order is ${order.status}, cannot deliver`);

  return prisma.marketplaceOrder.update({
    where: { id: orderId },
    data: { status: 'delivered', deliverables },
  });
}

// ── Request Revision ──────────────────────────────────────────

export async function requestRevision(orderId: string, buyerUserId: string) {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: { service: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.buyerId !== buyerUserId) throw new Error('Unauthorized');
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
    if (order.buyerId !== buyerUserId) throw new Error('Unauthorized');
    if (order.status !== 'delivered') throw new Error('Order must be delivered to complete');

    const updated = await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'complete' },
    });

    const platformFee = calcFee(order.amount, MARKETPLACE_PLAN);
    const netAmount   = order.amount - platformFee;

    // Release payout to seller (truthful: pending until processed)
    await tx.artistPayout.create({
      data: {
        artistId:  order.sellerId,
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
        artistId:    order.sellerId,
        type:        'marketplace',
        amount:      order.amount,
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

  const sellerUser = await prisma.artist.findUnique({ where: { id: order.sellerId }, select: { userId: true } });
  const isParty = order.buyerId === raisedByUserId || sellerUser?.userId === raisedByUserId;
  if (!isParty) throw new Error('Only order parties can raise a dispute');

  return prisma.$transaction(async (tx) => {
    await tx.marketplaceOrder.update({ where: { id: orderId }, data: { status: 'disputed' } });
    return tx.marketplaceDispute.create({
      data: { orderId, raisedBy: raisedByUserId, reason, status: 'open' },
    });
  });
}

// ── Submit Review ─────────────────────────────────────────────

export async function submitReview(
  orderId: string,
  reviewerUserId: string,
  rating: number,
  body?: string,
) {
  if (rating < 1 || rating > 5) throw new Error('Rating must be 1–5');
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.buyerId !== reviewerUserId) throw new Error('Only the buyer can review');
  if (order.status !== 'complete') throw new Error('Can only review completed orders');

  return prisma.serviceReview.create({
    data: {
      orderId,
      serviceId:   order.serviceId,
      reviewerId:  reviewerUserId,
      rating,
      body:        body || '',
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
