// ============================================================
// PHASE 2 — src/lib/marketplace.ts
// Marketplace Engine: orders, milestones, disputes, reviews,
// delivery, contracts, payout on completion.
// ============================================================

import prisma from './prisma';

const PLATFORM_FEE_RATE = 0.15; // 15% on marketplace orders

// ── Order Creation ────────────────────────────────────────────

export async function createMarketplaceOrder(params: {
  serviceId: string;
  buyerUserId: string;
  packageName: string;
  requirements?: string;
}) {
  const service = await prisma.marketplaceService.findUnique({
    where: { id: params.serviceId },
    include: { artist: { include: { user: true } } },
  });
  if (!service || !service.isActive) throw new Error('Service not available');

  const packages: any[] = service.packages as any[];
  const pkg = packages.find((p: any) => p.name === params.packageName);
  if (!pkg) throw new Error(`Package "${params.packageName}" not found on this service`);

  // Prevent self-orders
  const buyer = await prisma.user.findUnique({ where: { id: params.buyerUserId }, include: { artist: true } });
  if (buyer?.artist?.id === service.artistId) throw new Error('Cannot order your own service');

  const platformFee = Math.round(pkg.price * PLATFORM_FEE_RATE * 100) / 100;
  const netAmount   = pkg.price - platformFee;

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + pkg.deliveryDays);

  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.create({
      data: {
        serviceId: params.serviceId,
        buyerUserId: params.buyerUserId,
        sellerArtistId: service.artistId,
        packageName: pkg.name,
        packagePrice: pkg.price,
        currency: 'ZAR',
        requirements: params.requirements || '',
        status: 'pending',
        deliveryDays: pkg.deliveryDays,
        dueAt,
        maxRevisions: pkg.revisions || 1,
        platformFee,
        netAmount,
      },
    });

    // Track platform commission
    await tx.platformCommission.create({
      data: {
        orderId: order.id,
        source: 'marketplace',
        grossAmount: pkg.price,
        commissionRate: PLATFORM_FEE_RATE,
        commissionAmount: platformFee,
        currency: 'ZAR',
        artistId: service.artistId,
        period: getPeriod(),
      },
    });

    return order;
  });
}

// ── Order Acceptance ──────────────────────────────────────────

export async function acceptOrder(orderId: string, sellerArtistId: string) {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.sellerArtistId !== sellerArtistId) throw new Error('Unauthorized');
  if (order.status !== 'pending') throw new Error(`Order is ${order.status}, cannot accept`);

  return prisma.marketplaceOrder.update({
    where: { id: orderId },
    data: { status: 'in_progress' },
  });
}

// ── Deliver Order ─────────────────────────────────────────────

export async function deliverOrder(
  orderId: string,
  sellerArtistId: string,
  deliverables: { url: string; filename: string; description: string }[],
  notes?: string
) {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.sellerArtistId !== sellerArtistId) throw new Error('Unauthorized');
  if (order.status !== 'in_progress') throw new Error(`Order is ${order.status}, cannot deliver`);

  return prisma.marketplaceOrder.update({
    where: { id: orderId },
    data: {
      status: 'delivered',
      deliveredAt: new Date(),
      deliverables,
      sellerNotes: notes || '',
    },
  });
}

// ── Request Revision ──────────────────────────────────────────

export async function requestRevision(
  orderId: string,
  buyerUserId: string,
  notes: string
) {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.buyerUserId !== buyerUserId) throw new Error('Unauthorized');
  if (order.status !== 'delivered') throw new Error('Order has not been delivered yet');
  if (order.revisionCount >= order.maxRevisions) {
    throw new Error(`Max revisions (${order.maxRevisions}) reached`);
  }

  return prisma.marketplaceOrder.update({
    where: { id: orderId },
    data: {
      status: 'revision_requested',
      revisionCount: { increment: 1 },
      revisionNotes: notes,
    },
  });
}

// ── Complete Order ────────────────────────────────────────────

export async function completeOrder(orderId: string, buyerUserId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.buyerUserId !== buyerUserId) throw new Error('Unauthorized');
    if (!['delivered'].includes(order.status)) {
      throw new Error(`Order must be delivered to complete. Current: ${order.status}`);
    }

    const updated = await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'completed', completedAt: new Date() },
    });

    // Release payout to seller — create ArtistPayout record
    await tx.artistPayout.create({
      data: {
        artistId: order.sellerArtistId,
        purchaseId: order.purchaseId || undefined,
        amount: order.packagePrice,
        fee: order.platformFee,
        netAmount: order.netAmount,
        method: 'payfast',
        currency: order.currency,
        status: 'pending',
        notes: `Marketplace order completed — ${order.packageName}`,
      },
    });

    // Update service stats
    await tx.marketplaceService.update({
      where: { id: order.serviceId },
      data: { totalOrders: { increment: 1 } },
    });

    // Revenue record
    await tx.revenueRecord.upsert({
      where: {
        artistId_period: { artistId: order.sellerArtistId, period: getPeriod() },
      },
      create: {
        artistId: order.sellerArtistId,
        period: getPeriod(),
        marketplace: order.netAmount,
        grossRevenue: order.packagePrice,
        platformFees: order.platformFee,
        netRevenue: order.netAmount,
        pendingAmount: order.netAmount,
        payoutAmount: 0,
      },
      update: {
        marketplace: { increment: order.netAmount },
        grossRevenue: { increment: order.packagePrice },
        platformFees: { increment: order.platformFee },
        netRevenue:   { increment: order.netAmount },
        pendingAmount: { increment: order.netAmount },
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
  evidence: { url: string; description: string }[] = []
) {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');

  const isParty =
    order.buyerUserId === raisedByUserId ||
    (await prisma.artist.findFirst({ where: { id: order.sellerArtistId, userId: raisedByUserId } })) !== null;

  if (!isParty) throw new Error('Only order parties can raise a dispute');

  return prisma.$transaction(async (tx) => {
    await tx.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'disputed' },
    });

    return tx.marketplaceDispute.create({
      data: {
        orderId,
        raisedByUserId,
        reason,
        evidence,
        status: 'open',
      },
    });
  });
}

// ── Submit Review ─────────────────────────────────────────────

export async function submitReview(
  orderId: string,
  reviewerUserId: string,
  rating: number,
  comment?: string
) {
  if (rating < 1 || rating > 5) throw new Error('Rating must be 1-5');

  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.buyerUserId !== reviewerUserId) throw new Error('Only the buyer can review');
  if (order.status !== 'completed') throw new Error('Can only review completed orders');

  const review = await prisma.serviceReview.create({
    data: {
      serviceId: order.serviceId,
      orderId,
      reviewerUserId,
      rating,
      comment: comment || '',
    },
  });

  // Update service rating average
  const stats = await prisma.serviceReview.aggregate({
    where: { serviceId: order.serviceId },
    _avg: { rating: true },
    _count: true,
  });

  await prisma.marketplaceService.update({
    where: { id: order.serviceId },
    data: {
      rating: Math.round((stats._avg.rating || 0) * 100) / 100,
      reviewCount: stats._count,
    },
  });

  return review;
}

// ── Helpers ───────────────────────────────────────────────────

function getPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Query helpers for API routes ──────────────────────────────

export async function listServices(filters: {
  category?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  take?: number;
  skip?: number;
}) {
  const where: any = { isActive: true };
  if (filters.category) where.category = filters.category;
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return prisma.marketplaceService.findMany({
    where,
    include: {
      artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true } },
      _count: { select: { orders: true } },
    },
    orderBy: [{ rating: 'desc' }, { totalOrders: 'desc' }],
    take: filters.take || 20,
    skip: filters.skip || 0,
  });
}
