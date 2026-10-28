/**
 * Shared Vuka platform-fee ledger.
 *
 * Counts only settled/confirmed sales and support payments, excludes refunded
 * sales/tips, and deducts processor fees only when a processor supplied a value.
 * A null processorFee is unknown (not zero). VAT remains zero until Vuka confirms
 * VAT registration and provides an approved VAT calculation.
 */
import prisma from '@/lib/prisma';

export interface RevenueSummary {
  periodStart: Date | null;
  periodEnd: Date | null;
  grossPlatformFees: number;
  knownProcessorFees: number;
  netPlatformFees: number;
  unknownProcessorFeeRows: number;
  unknownPlatformFeeRows: number;
  vatAmount: 0;
  bySource: Record<string, { platformFees: number; knownProcessorFees: number; unknownProcessorFeeRows: number; unknownPlatformFeeRows: number; rows: number }>;
}

type RevenueRow = { amount?: number; platformFee: number; processorFee: number | null };

function addSource(
  summary: RevenueSummary,
  source: string,
  rows: RevenueRow[],
) {
  let platformFees = 0;
  let knownProcessorFees = 0;
  let unknownProcessorFeeRows = 0;
  let unknownPlatformFeeRows = 0;
  for (const row of rows) {
    const fee = Math.max(0, Number(row.platformFee) || 0);
    const amount = Math.max(0, Number(row.amount) || 0);
    platformFees += fee;
    if (amount > 0 && fee <= 0) unknownPlatformFeeRows += 1;
    if (amount > 0 && (row.processorFee == null || !Number.isFinite(Number(row.processorFee)))) {
      unknownProcessorFeeRows += 1;
    } else if (row.processorFee != null && Number.isFinite(Number(row.processorFee))) {
      knownProcessorFees += Math.max(0, Number(row.processorFee) || 0);
    }
  }
  summary.bySource[source] = {
    platformFees: round2(platformFees),
    knownProcessorFees: round2(knownProcessorFees),
    unknownProcessorFeeRows,
    unknownPlatformFeeRows,
    rows: rows.length,
  };
  summary.grossPlatformFees += platformFees;
  summary.knownProcessorFees += knownProcessorFees;
  summary.unknownProcessorFeeRows += unknownProcessorFeeRows;
  summary.unknownPlatformFeeRows += unknownPlatformFeeRows;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface UnknownProcessorFeeRow {
  id: string;
  recordType: 'purchase' | 'support' | 'subscription' | 'industry_service';
  source: string;
  amount: number;
  platformFee: number;
  processorFee: number | null;
  createdAt: Date;
  reference: string;
  platformFeeMissing: boolean;
}

export async function getUnknownProcessorFeeRows(limit = 100): Promise<UnknownProcessorFeeRow[]> {
  const rows: UnknownProcessorFeeRow[] = [];
  const purchases = await prisma.purchase.findMany({
    where: { status: 'confirmed', amount: { gt: 0 }, OR: [{ processorFee: null }, { platformFee: 0 }] },
    select: { id: true, itemType: true, amount: true, platformFee: true, processorFee: true, createdAt: true, paystackReference: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  rows.push(...purchases.map(p => ({ id: p.id, recordType: 'purchase' as const, source: p.itemType, amount: p.amount, platformFee: p.platformFee, processorFee: p.processorFee, platformFeeMissing: p.amount > 0 && p.platformFee <= 0, createdAt: p.createdAt, reference: p.paystackReference || '' })));

  const tips = await prisma.supportTxn.findMany({
    where: { status: 'confirmed', amount: { gt: 0 }, OR: [{ processorFee: null }, { platformFee: 0 }] },
    select: { id: true, amount: true, platformFee: true, processorFee: true, createdAt: true, paystackReference: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  rows.push(...tips.map(t => ({ id: t.id, recordType: 'support' as const, source: 'artist_support', amount: t.amount, platformFee: t.platformFee, processorFee: t.processorFee, platformFeeMissing: t.amount > 0 && t.platformFee <= 0, createdAt: t.createdAt, reference: t.paystackReference || '' })));

  const subscriptions = await prisma.artistPlanSubscription.findMany({
    where: { status: { in: ['active', 'cancelled', 'expired'] }, processorFee: null, amount: { gt: 0 } },
    select: { id: true, planSlug: true, amount: true, processorFee: true, createdAt: true, paystackReference: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  rows.push(...subscriptions.map(s => ({ id: s.id, recordType: 'subscription' as const, source: `plan_${s.planSlug}`, amount: s.amount, platformFee: s.amount, processorFee: s.processorFee, platformFeeMissing: false, createdAt: s.createdAt, reference: s.paystackReference || '' })));

  const industry = await prisma.$queryRawUnsafe<Array<{ id: string; amount: number; platformFee: number; processorFee: number | null; createdAt: Date; reference: string }>>(
    `SELECT id, amount, "platformFee", "processorFee", "createdAt", COALESCE("payfastPaymentId", '') AS reference
       FROM "IndustryServiceOrder" WHERE status = 'paid' AND amount > 0 AND ("processorFee" IS NULL OR "platformFee" <= 0)
       ORDER BY "createdAt" DESC LIMIT $1`,
    limit,
  );
  rows.push(...industry.map(o => ({ id: o.id, recordType: 'industry_service' as const, source: 'industry_service', amount: Number(o.amount) || 0, platformFee: Number(o.platformFee) || 0, processorFee: o.processorFee == null ? null : Number(o.processorFee), platformFeeMissing: Number(o.amount) > 0 && Number(o.platformFee) <= 0, createdAt: o.createdAt, reference: o.reference })));

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

export async function getPlatformRevenue(periodStart?: Date, periodEnd?: Date): Promise<RevenueSummary> {
  const createdAt = periodStart || periodEnd
    ? { ...(periodStart ? { gte: periodStart } : {}), ...(periodEnd ? { lt: periodEnd } : {}) }
    : undefined;
  const summary: RevenueSummary = {
    periodStart: periodStart ?? null,
    periodEnd: periodEnd ?? null,
    grossPlatformFees: 0,
    knownProcessorFees: 0,
    netPlatformFees: 0,
    unknownProcessorFeeRows: 0,
    unknownPlatformFeeRows: 0,
    vatAmount: 0,
    bySource: {},
  };

  // Sequential reads intentionally avoid exhausting the serverless DB pool.
  const purchases = await prisma.purchase.findMany({
    where: { status: 'confirmed', ...(createdAt ? { createdAt } : {}) },
    select: { itemType: true, amount: true, platformFee: true, processorFee: true },
  });
  const purchasesByType = new Map<string, typeof purchases>();
  for (const purchase of purchases) {
    const group = purchasesByType.get(purchase.itemType) ?? [];
    group.push(purchase);
    purchasesByType.set(purchase.itemType, group);
  }
  for (const [itemType, rows] of purchasesByType) {
    addSource(summary, `sales_${itemType || 'other'}`, rows);
  }

  const tips = await prisma.supportTxn.findMany({
    where: { status: 'confirmed', ...(createdAt ? { createdAt } : {}) },
    select: { amount: true, platformFee: true, processorFee: true },
  });
  addSource(summary, 'artist_support', tips);

  const subscriptions = await prisma.artistPlanSubscription.findMany({
    where: {
      status: { in: ['active', 'cancelled', 'expired'] },
      ...(createdAt ? { createdAt } : {}),
    },
    select: { amount: true, processorFee: true },
  });
  addSource(summary, 'artist_plan_subscriptions', subscriptions.map((s) => ({
    // Subscription payments are paid to Vuka; only known processor fees are deducted.
    amount: Number(s.amount) || 0,
    platformFee: Number(s.amount) || 0,
    processorFee: s.processorFee,
  })));

  // Marketplace service checkout also writes a Purchase row, so it is already
  // included above. Counting MarketplaceOrder here would double-count that fee.
  // IndustryServiceOrder is a legacy SQL-backed table; include its paid ledger rows.
  const industryOrders = await prisma.$queryRawUnsafe<Array<{ amount: number; platformFee: number; processorFee: number | null }>>(
    `SELECT amount, "platformFee", "processorFee"
       FROM "IndustryServiceOrder"
      WHERE status = 'paid'
        AND ($1::timestamptz IS NULL OR "createdAt" >= $1)
        AND ($2::timestamptz IS NULL OR "createdAt" < $2)`,
    periodStart ?? null,
    periodEnd ?? null,
  );
  addSource(summary, 'industry_services', industryOrders.map((o) => ({
    amount: Number(o.amount) || 0,
    platformFee: Number(o.platformFee) || 0,
    processorFee: o.processorFee == null ? null : Number(o.processorFee),
  })));

  summary.grossPlatformFees = round2(summary.grossPlatformFees);
  summary.knownProcessorFees = round2(summary.knownProcessorFees);
  summary.netPlatformFees = round2(summary.grossPlatformFees - summary.knownProcessorFees);
  return summary;
}
