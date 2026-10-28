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
  vatAmount: 0;
  bySource: Record<string, { platformFees: number; knownProcessorFees: number; unknownProcessorFeeRows: number; rows: number }>;
}

type RevenueRow = { platformFee: number; processorFee: number | null };

function addSource(
  summary: RevenueSummary,
  source: string,
  rows: RevenueRow[],
) {
  let platformFees = 0;
  let knownProcessorFees = 0;
  let unknownProcessorFeeRows = 0;
  for (const row of rows) {
    platformFees += Math.max(0, Number(row.platformFee) || 0);
    if (row.processorFee == null || !Number.isFinite(Number(row.processorFee))) {
      unknownProcessorFeeRows += 1;
    } else {
      knownProcessorFees += Math.max(0, Number(row.processorFee) || 0);
    }
  }
  summary.bySource[source] = {
    platformFees: round2(platformFees),
    knownProcessorFees: round2(knownProcessorFees),
    unknownProcessorFeeRows,
    rows: rows.length,
  };
  summary.grossPlatformFees += platformFees;
  summary.knownProcessorFees += knownProcessorFees;
  summary.unknownProcessorFeeRows += unknownProcessorFeeRows;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
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
    vatAmount: 0,
    bySource: {},
  };

  // Sequential reads intentionally avoid exhausting the serverless DB pool.
  const purchases = await prisma.purchase.findMany({
    where: { status: 'confirmed', ...(createdAt ? { createdAt } : {}) },
    select: { platformFee: true, processorFee: true },
  });
  addSource(summary, 'marketplace_and_direct_sales', purchases);

  const tips = await prisma.supportTxn.findMany({
    where: { status: 'confirmed', ...(createdAt ? { createdAt } : {}) },
    select: { platformFee: true, processorFee: true },
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
    platformFee: Number(s.amount) || 0,
    processorFee: s.processorFee,
  })));

  const marketplaceOrders = await prisma.marketplaceOrder.findMany({
    where: { status: 'complete', ...(createdAt ? { completedAt: createdAt } : {}) },
    select: { platformFee: true },
  });
  addSource(summary, 'marketplace_services', marketplaceOrders.map((o) => ({
    platformFee: Number(o.platformFee) || 0,
    processorFee: null,
  })));

  summary.grossPlatformFees = round2(summary.grossPlatformFees);
  summary.knownProcessorFees = round2(summary.knownProcessorFees);
  summary.netPlatformFees = round2(summary.grossPlatformFees - summary.knownProcessorFees);
  return summary;
}
