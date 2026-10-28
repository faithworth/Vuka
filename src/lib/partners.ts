import prisma from '@/lib/prisma';
import { getPlatformRevenue } from '@/lib/revenue';

export type QualificationCategory = 'none' | 'active_sales' | 'paid_or_steady' | 'strong_seller';
export interface CreatorQualification {
  userId: string;
  name: string;
  role: string;
  joinedAt: Date;
  verified: boolean;
  hasRelease: boolean;
  sales90d: number;
  uniqueFans90d: number;
  grossSales90d: number;
  category: QualificationCategory;
  points: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function rateFromQualifications(creators: CreatorQualification[]) {
  const points = creators.reduce((sum, c) => sum + c.points, 0);
  return {
    points,
    rate: Math.min(0.25, Math.round((0.10 + points / 100) * 1000) / 1000),
  };
}

export async function getPartnerCreatorQualifications(referralCode: string, asOf = new Date()) {
  const end = new Date(asOf);
  const start = new Date(end.getTime() - 90 * DAY_MS);
  const referred = await prisma.user.findMany({
    where: {
      referredBy: referralCode,
      role: { in: ['artist', 'producer'] },
      artist: { isNot: null },
    },
    include: {
      artist: {
        include: {
          releases: { select: { id: true }, take: 1 },
          planSubscriptions: {
            where: { status: { in: ['active', 'cancelled', 'expired'] }, currentPeriodStart: { lt: end } },
            select: { currentPeriodStart: true, currentPeriodEnd: true, amount: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const results: CreatorQualification[] = [];
  for (const user of referred) {
    const artist = user.artist;
    if (!artist) continue;
    const purchases = await prisma.purchase.findMany({
      where: {
        status: 'confirmed',
        createdAt: { gte: start, lt: end },
        OR: [
          { artistId: artist.id },
          { beat: { artistId: artist.id } },
          { release: { artistId: artist.id } },
          { video: { artistId: artist.id } },
          { sample: { artistId: artist.id } },
          { merch: { artistId: artist.id } },
        ],
      },
      select: { amount: true, buyerEmail: true, createdAt: true },
    });
    const uniqueFans = new Set(purchases.map(p => p.buyerEmail.trim().toLowerCase()).filter(Boolean));
    const grossSales90d = round2(purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    const hasRelease = artist.releases.length > 0;
    const eligible = Boolean(artist.isVerified && hasRelease);
    const paidForTwoMonths = artist.planSource === 'paid'
      && artist.planSlug !== 'free'
      && Boolean(artist.planExpiresAt && artist.planExpiresAt > end)
      && artist.planSubscriptions.some(s => s.currentPeriodEnd.getTime() - s.currentPeriodStart.getTime() >= 55 * DAY_MS);
    let category: QualificationCategory = 'none';
    let points = 0;
    if (eligible && grossSales90d >= 5000) {
      category = 'strong_seller'; points = 2;
    } else if (eligible && (paidForTwoMonths || purchases.length >= 20)) {
      category = 'paid_or_steady'; points = 1;
    } else if (eligible && purchases.length >= 5 && uniqueFans.size >= 3) {
      category = 'active_sales'; points = 0.5;
    }
    results.push({
      userId: user.id,
      name: artist.name || user.name,
      role: user.role,
      joinedAt: user.createdAt,
      verified: Boolean(artist.isVerified),
      hasRelease,
      sales90d: purchases.length,
      uniqueFans90d: uniqueFans.size,
      grossSales90d,
      category,
      points,
    });
  }
  return results;
}

export async function createPartnerMonthlyStatement(partnerId: string, year: number, month1to12: number) {
  const periodStart = new Date(Date.UTC(year, month1to12 - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month1to12, 1));
  const partner = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    include: { user: true },
  });
  if (!partner) throw new Error('Partner not found');

  // Contract rate for the month uses qualifying creators at the end of the previous month.
  const qualifications = await getPartnerCreatorQualifications(partner.referralCode, periodStart);
  const rate = rateFromQualifications(qualifications).rate;
  const revenue = await getPlatformRevenue(periodStart, periodEnd);
  const shareAmount = round2(revenue.netPlatformFees * rate);
  const categories = {
    active_sales: qualifications.filter(c => c.category === 'active_sales').length,
    paid_or_steady: qualifications.filter(c => c.category === 'paid_or_steady').length,
    strong_seller: qualifications.filter(c => c.category === 'strong_seller').length,
    qualifyingCreators: qualifications.filter(c => c.category !== 'none').length,
  };
  const reconciliationNote = revenue.unknownProcessorFeeRows > 0
    ? `Draft only: ${revenue.unknownProcessorFeeRows} processor fee record(s) are unknown; reconcile before payment.`
    : '';

  return prisma.partnerMonthlyStatement.upsert({
    where: { partnerId_periodStart: { partnerId, periodStart } },
    create: {
      partnerId,
      periodStart,
      periodEnd,
      grossPlatformFees: revenue.grossPlatformFees,
      knownProcessorFees: revenue.knownProcessorFees,
      netPlatformFees: revenue.netPlatformFees,
      unknownProcessorFeeRows: revenue.unknownProcessorFeeRows,
      shareRate: rate,
      shareAmount,
      qualifyingCreators: categories.qualifyingCreators,
      categoryBreakdown: categories,
      status: reconciliationNote ? 'draft' : 'issued',
      notes: reconciliationNote,
      issuedAt: reconciliationNote ? null : new Date(),
    },
    update: {
      grossPlatformFees: revenue.grossPlatformFees,
      knownProcessorFees: revenue.knownProcessorFees,
      netPlatformFees: revenue.netPlatformFees,
      unknownProcessorFeeRows: revenue.unknownProcessorFeeRows,
      shareRate: rate,
      shareAmount,
      qualifyingCreators: categories.qualifyingCreators,
      categoryBreakdown: categories,
      status: reconciliationNote ? 'draft' : 'issued',
      notes: reconciliationNote,
      issuedAt: reconciliationNote ? null : new Date(),
    },
  });
}
