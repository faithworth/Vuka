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
  // Idempotency guard — never create a second invoice for the same purchase.
  const already = await prisma.invoice.findFirst({ where: { purchaseId } });
  if (already) return already;

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
      invoiceNumber: number,
      number,
      artistId:   artist?.id,
      purchaseId: purchase.id,
      buyerName:  purchase.buyerName,
      buyerEmail: purchase.buyerEmail,
      lineItems:  [{ description: itemName, amount: purchase.amount, quantity: 1 }],
      subtotal:   purchase.amount,
      total:      purchase.amount,
      currency:   purchase.currency,
      status:     'paid',
      issuedAt:   new Date(),
    },
  });
}

// ── Create Invoice from Marketplace Order ─────────────────────

export async function createInvoiceFromOrder(orderId: string) {
  // Idempotency guard — never create a second invoice for the same order.
  const already = await prisma.invoice.findFirst({ where: { orderId } });
  if (already) return already;

  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: { service: true, seller: true, buyer: true },
  });
  if (!order) throw new Error('Order not found');

  const number = await generateInvoiceNumber();

  return prisma.invoice.create({
    data: {
      invoiceNumber: number,
      number,
      artistId:   order.sellerArtistId,
      orderId:    order.id,
      buyerName:  order.buyer?.name ?? 'Unknown',
      buyerEmail: order.buyer?.email ?? '',
      lineItems:  [{ description: order.packageName, amount: order.packagePrice, quantity: 1 }],
      subtotal:   order.packagePrice,
      total:      order.packagePrice,
      currency:   order.currency,
      status:     'paid',
      issuedAt:   new Date(),
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

  // MarketplaceOrder: schema fields are `sellerArtistId` and `packagePrice`
  const marketplaceOrders = await prisma.marketplaceOrder.findMany({
    where: { sellerArtistId: artistId, status: 'complete', createdAt: { gte: yearStart, lt: yearEnd } },
    select: { packagePrice: true },
  });
  const marketplaceTotal = marketplaceOrders.reduce((s, o) => s + o.packagePrice, 0);

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
