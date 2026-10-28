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
  excluded: boolean;
  exclusionReason: string | null;
  exclusionEffectiveFrom: Date | null;
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
  const partner = await prisma.partnerProfile.findUnique({
    where: { referralCode },
    select: {
      id: true,
      userId: true,
      exclusions: { select: { referredUserId: true, reason: true, effectiveFrom: true } },
      milestones: { select: { referredUserId: true, highestCategory: true, points: true, qualifiedAt: true, history: true } },
    },
  });
  const exclusions = new Map((partner?.exclusions ?? []).map(item => [item.referredUserId, item]));
  const milestones = new Map((partner?.milestones ?? []).map(item => [item.referredUserId, item]));
  const referred = await prisma.user.findMany({
    where: {
      referredBy: referralCode,
      ...(partner ? { id: { not: partner.userId } } : {}),
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
    const exclusion = exclusions.get(user.id);
    const exclusionReason = exclusion?.reason ?? null;
    const exclusionEffectiveFrom = exclusion?.effectiveFrom ?? null;
    const excluded = Boolean(exclusionEffectiveFrom && exclusionEffectiveFrom <= end);
    const eligible = Boolean(artist.isVerified && hasRelease && !excluded);
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

    // Contract rule: a creator who stops selling keeps their highest earned
    // category. Keep dated milestones so a later upgrade cannot change an older
    // month's statement rate retroactively.
    const prior = milestones.get(user.id);
    let history = prior && Array.isArray(prior.history)
      ? [...prior.history as Array<{ category: QualificationCategory; points: number; qualifiedAt: string }>]
      : [];
    if (partner && !excluded && points > 0) {
      const hasEffectiveCategory = history.some(item =>
        item.category === category && item.points === points && new Date(item.qualifiedAt) <= end
      );
      if (!hasEffectiveCategory) {
        history.push({ category, points, qualifiedAt: new Date(end.getTime() - 1).toISOString() });
        const highestEver = history.reduce((best, item) => item.points > best.points ? item : best, { category: 'none' as QualificationCategory, points: 0, qualifiedAt: end.toISOString() });
        const firstQualified = history.reduce((first, item) => new Date(item.qualifiedAt) < new Date(first) ? item.qualifiedAt : first, history[0].qualifiedAt);
        const saved = await prisma.partnerCreatorMilestone.upsert({
          where: { partnerId_referredUserId: { partnerId: partner.id, referredUserId: user.id } },
          create: {
            partnerId: partner.id,
            referredUserId: user.id,
            highestCategory: highestEver.category,
            points: highestEver.points,
            qualifiedAt: new Date(firstQualified),
            history,
            lastEvaluatedAt: end,
          },
          update: {
            highestCategory: highestEver.category,
            points: highestEver.points,
            qualifiedAt: prior?.qualifiedAt ?? new Date(firstQualified),
            history,
            lastEvaluatedAt: end,
          },
          select: { referredUserId: true, highestCategory: true, points: true, qualifiedAt: true, history: true },
        });
        milestones.set(user.id, saved);
      }
    }
    const milestone = milestones.get(user.id);
    const effectiveHistory = milestone && Array.isArray(milestone.history)
      ? (milestone.history as Array<{ category: QualificationCategory; points: number; qualifiedAt: string }>)
          .filter(item => new Date(item.qualifiedAt) <= end)
      : [];
    const historicalBest = effectiveHistory.reduce((best, item) => item.points > best.points ? item : best, { category: 'none' as QualificationCategory, points: 0, qualifiedAt: end.toISOString() });
    if (excluded) {
      category = 'none';
      points = 0;
    } else if (historicalBest.points > points) {
      category = historicalBest.category;
      points = historicalBest.points;
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
      excluded,
      exclusionReason,
      exclusionEffectiveFrom,
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
  const existingStatement = await prisma.partnerMonthlyStatement.findUnique({
    where: { partnerId_periodStart: { partnerId, periodStart } },
  });
  if (existingStatement?.status === 'paid') return existingStatement;

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
  const reconciliationNote = revenue.unknownProcessorFeeRows > 0 || revenue.unknownPlatformFeeRows > 0
    ? `Draft only: ${revenue.unknownProcessorFeeRows} processor fee record(s) and ${revenue.unknownPlatformFeeRows} platform fee record(s) are unknown; reconcile before payment.`
    : '';

  await prisma.partnerProfile.update({
    where: { id: partnerId },
    data: { currentRate: rate },
  });

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
      unknownPlatformFeeRows: revenue.unknownPlatformFeeRows,
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
      unknownPlatformFeeRows: revenue.unknownPlatformFeeRows,
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
