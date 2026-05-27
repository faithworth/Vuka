// ============================================================
// PHASE 2 — src/lib/invoices.ts
// Invoice generation, receipts, tax records, commissions.
// ============================================================

import prisma from './prisma';

// ── Invoice Number Generation ─────────────────────────────────
let invoiceCounter = 0;

export async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const count = await prisma.invoice.count({
    where: {
      createdAt: {
        gte: new Date(year, now.getMonth(), 1),
        lt:  new Date(year, now.getMonth() + 1, 1),
      },
    },
  });

  const seq = String(count + 1 + invoiceCounter).padStart(4, '0');
  invoiceCounter++;
  return `VK-${year}${month}-${seq}`;
}

// ── Create Invoice from Purchase ──────────────────────────────

export async function createInvoiceFromPurchase(purchaseId: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      beat: { include: { artist: true } },
      release: { include: { artist: true } },
      user: true,
    },
  });
  if (!purchase) throw new Error('Purchase not found');
  if (purchase.status !== 'confirmed') throw new Error('Purchase not confirmed');

  const itemName = purchase.beat?.title || purchase.release?.title || 'Digital Content';
  const artist   = purchase.beat?.artist || purchase.release?.artist;
  const vatRate  = 0;  // Apply 15% when artist is VAT registered
  const subtotal = purchase.amount;
  const taxAmount = Math.round(subtotal * vatRate * 100) / 100;
  const total     = subtotal + taxAmount;

  const invoiceNumber = await generateInvoiceNumber();

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      artistId: artist?.id || null,
      buyerName:  purchase.buyerName,
      buyerEmail: purchase.buyerEmail,
      lineItems: [
        {
          description: `${itemName}${purchase.licenseType ? ` — ${purchase.licenseType} License` : ''}`,
          qty: 1,
          unitPrice: purchase.amount,
          total: purchase.amount,
        },
      ],
      subtotal,
      taxRate: vatRate,
      taxAmount,
      total,
      currency: purchase.currency,
      status: 'paid',
      paidAt: new Date(),
      purchaseId: purchase.id,
    },
  });
}

// ── Create Invoice from Marketplace Order ─────────────────────

export async function createInvoiceFromOrder(orderId: string) {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: {
      service: true,
      buyer: true,
      seller: { include: { user: true } },
    },
  });
  if (!order) throw new Error('Order not found');

  const subtotal  = order.packagePrice;
  const vatRate   = 0;
  const taxAmount = Math.round(subtotal * vatRate * 100) / 100;
  const total     = subtotal + taxAmount;

  const invoiceNumber = await generateInvoiceNumber();

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      artistId: order.sellerArtistId,
      buyerName:  order.buyer.name,
      buyerEmail: order.buyer.email,
      lineItems: [
        {
          description: `${order.service.title} — ${order.packageName}`,
          qty: 1,
          unitPrice: order.packagePrice,
          total: order.packagePrice,
        },
      ],
      subtotal,
      taxRate: vatRate,
      taxAmount,
      total,
      currency: order.currency,
      status: order.status === 'completed' ? 'paid' : 'sent',
      paidAt: order.completedAt || undefined,
      orderId: order.id,
    },
  });
}

// ── Generate Annual Tax Record ────────────────────────────────

export async function generateTaxRecord(artistId: string, taxYear: number) {
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd   = new Date(taxYear + 1, 0, 1);

  // Aggregate all confirmed purchases for artist this year
  const [beatRevenue, releaseRevenue, marketplaceRevenue, tipRevenue, platformFees] =
    await Promise.all([
      prisma.purchase.aggregate({
        where: {
          status: 'confirmed',
          itemType: 'beat',
          beat: { artistId },
          createdAt: { gte: yearStart, lt: yearEnd },
        },
        _sum: { netAmount: true, platformFee: true },
      }),
      prisma.purchase.aggregate({
        where: {
          status: 'confirmed',
          itemType: 'release',
          release: { artistId },
          createdAt: { gte: yearStart, lt: yearEnd },
        },
        _sum: { netAmount: true, platformFee: true },
      }),
      prisma.marketplaceOrder.aggregate({
        where: {
          status: 'completed',
          sellerArtistId: artistId,
          completedAt: { gte: yearStart, lt: yearEnd },
        },
        _sum: { netAmount: true, platformFee: true },
      }),
      prisma.supportTxn.aggregate({
        where: {
          status: 'confirmed',
          artistId,
          createdAt: { gte: yearStart, lt: yearEnd },
        },
        _sum: { amount: true },
      }),
      prisma.artistPayout.aggregate({
        where: {
          artistId,
          createdAt: { gte: yearStart, lt: yearEnd },
        },
        _sum: { fee: true },
      }),
    ]);

  const breakdown = {
    beatSales:   beatRevenue._sum.netAmount    || 0,
    releaseSales: releaseRevenue._sum.netAmount || 0,
    marketplace:  marketplaceRevenue._sum.netAmount || 0,
    tips:         tipRevenue._sum.amount        || 0,
  };

  const totalIncome = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const totalFees   = platformFees._sum.fee || 0;
  const netIncome   = totalIncome - totalFees;

  return prisma.taxRecord.upsert({
    where: { artistId_taxYear: { artistId, taxYear } },
    create: {
      artistId,
      taxYear,
      totalIncome,
      totalFees,
      netIncome,
      currency: 'ZAR',
      breakdown,
      generatedAt: new Date(),
    },
    update: {
      totalIncome,
      totalFees,
      netIncome,
      breakdown,
      generatedAt: new Date(),
    },
  });
}

// ── Platform Commission Reporting ─────────────────────────────

export async function getPlatformCommissionReport(period?: string) {
  const where: any = {};
  if (period) where.period = period;

  const [total, bySource] = await Promise.all([
    prisma.platformCommission.aggregate({
      where,
      _sum: { commissionAmount: true, grossAmount: true },
      _count: true,
    }),
    prisma.platformCommission.groupBy({
      by: ['source'],
      where,
      _sum: { commissionAmount: true, grossAmount: true },
      _count: true,
    }),
  ]);

  return {
    period: period || 'all-time',
    totalCommission: total._sum.commissionAmount || 0,
    totalGross:      total._sum.grossAmount      || 0,
    totalTransactions: total._count,
    bySource: bySource.map(s => ({
      source:     s.source,
      commission: s._sum.commissionAmount || 0,
      gross:      s._sum.grossAmount      || 0,
      count:      s._count,
    })),
  };
}
