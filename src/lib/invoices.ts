// ============================================================
// src/lib/invoices.ts — Invoice generation, tax records
// Fixed: uses actual schema fields only
// ============================================================

import prisma from './prisma';

// ── Invoice Number Generation ─────────────────────────────────

export async function generateInvoiceNumber(): Promise<string> {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const count = await prisma.invoice.count({
    where: { createdAt: { gte: new Date(year, now.getMonth(), 1), lt: new Date(year, now.getMonth() + 1, 1) } },
  });
  return `VK-${year}${month}-${String(count + 1).padStart(4, '0')}`;
}

// ── Create Invoice from Purchase ──────────────────────────────

export async function createInvoiceFromPurchase(purchaseId: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      beat:    { include: { artist: true } },
      release: { include: { artist: true } },
    },
  });
  if (!purchase) throw new Error('Purchase not found');
  if (purchase.status !== 'confirmed') throw new Error('Purchase not confirmed');

  const itemName = purchase.beat?.title || purchase.release?.title || 'Digital Content';
  const artist   = purchase.beat?.artist || purchase.release?.artist;
  const number   = await generateInvoiceNumber();

  return prisma.invoice.create({
    data: {
      number,
      artistId:  artist?.id ?? '',
      purchaseId: purchase.id,
      total:     purchase.amount,
      currency:  purchase.currency,
      issuedAt:  new Date(),
    },
  });
}

// ── Create Invoice from Marketplace Order ─────────────────────

export async function createInvoiceFromOrder(orderId: string) {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: { service: true, seller: true },
  });
  if (!order) throw new Error('Order not found');

  const number = await generateInvoiceNumber();

  return prisma.invoice.create({
    data: {
      number,
      artistId: order.sellerArtistId,
      total:    order.packagePrice,
      currency: order.currency,
      issuedAt: new Date(),
    },
  });
}

// ── Generate Annual Tax Record ────────────────────────────────

export async function generateTaxRecord(artistId: string, year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year + 1, 0, 1);

  // Purchase netAmount IS a real field on Purchase model
  const [beatRevenue, releaseRevenue, tipRevenue] = await Promise.all([
    prisma.purchase.aggregate({
      where: { status: 'confirmed', itemType: 'beat', beat: { artistId }, createdAt: { gte: yearStart, lt: yearEnd } },
      _sum: { netAmount: true, platformFee: true },
    }),
    prisma.purchase.aggregate({
      where: { status: 'confirmed', itemType: 'release', release: { artistId }, createdAt: { gte: yearStart, lt: yearEnd } },
      _sum: { netAmount: true, platformFee: true },
    }),
    prisma.supportTxn.aggregate({
      where: { artistId, createdAt: { gte: yearStart, lt: yearEnd } },
      _sum: { amount: true },
    }),
  ]);

  // MarketplaceOrder: use `amount` and `sellerId` (schema fields that exist)
  const marketplaceOrders = await prisma.marketplaceOrder.findMany({
    where: { sellerId: artistId, status: 'complete', createdAt: { gte: yearStart, lt: yearEnd } },
    select: { amount: true },
  });
  const marketplaceTotal = marketplaceOrders.reduce((s, o) => s + o.amount, 0);

  const totalEarnings  = (beatRevenue._sum.netAmount ?? 0)
                       + (releaseRevenue._sum.netAmount ?? 0)
                       + marketplaceTotal
                       + (tipRevenue._sum.amount ?? 0);
  const platformFees   = (beatRevenue._sum.platformFee ?? 0)
                       + (releaseRevenue._sum.platformFee ?? 0);
  const netEarnings    = totalEarnings - platformFees;
  const quarter        = Math.ceil((new Date().getMonth() + 1) / 3);

  // findFirst then create/update (no unique constraint on TaxRecord)
  const existing = await prisma.taxRecord.findFirst({ where: { artistId, year, quarter } });
  if (existing) {
    return prisma.taxRecord.update({
      where: { id: existing.id },
      data: { totalEarnings, platformFees, netEarnings },
    });
  }
  return prisma.taxRecord.create({
    data: { artistId, year, quarter, totalEarnings, platformFees, netEarnings, currency: 'ZAR' },
  });
}

// ── Get Artist Invoices ───────────────────────────────────────

export async function getArtistInvoices(artistId: string) {
  return prisma.invoice.findMany({
    where: { artistId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { purchase: { select: { buyerName: true, buyerEmail: true, itemType: true } } },
  });
}
