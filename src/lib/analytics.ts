/**
 * VUKA — Analytics Engine (Phase 3)
 * Creator analytics, audience, revenue, stream, geography, engagement, conversion
 */

import prisma, { queryRaw } from './prisma';
import { incrementDailyRollup } from './social';

// ── PAGE VIEW TRACKING ────────────────────────────────────────

export async function recordPageView(data: {
  artistId?: string;
  targetType: string;
  targetId: string;
  userId?: string;
  country?: string;
  referrer?: string;
  sessionId?: string;
  userAgent?: string;
}) {
  try {
    await prisma.pageView.create({
      data: {
        artistId: data.artistId,
        targetType: data.targetType,
        targetId: data.targetId,
        userId: data.userId,
        country: data.country ?? '',
        referrer: data.referrer ?? '',
        sessionId: data.sessionId ?? '',
        userAgent: data.userAgent ?? '',
      },
    });

    // Roll into daily + geography
    if (data.artistId) {
      const field = data.targetType === 'artist_profile' ? 'profileViews' : 'storeViews';
      await incrementDailyRollup(data.artistId, field);

      if (data.country) {
        await upsertGeographyEvent(data.artistId, data.country, 'visit');
      }
    }
  } catch {
    // Non-critical — never break the page load
  }
}

export async function upsertGeographyEvent(
  artistId: string,
  countryCode: string,
  eventType: string
) {
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  const countryNames: Record<string, string> = {
    ZA: 'South Africa', NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya',
    US: 'United States', GB: 'United Kingdom', CA: 'Canada',
    AU: 'Australia', DE: 'Germany', FR: 'France',
  };

  await prisma.geographyEvent.upsert({
    where: {
      artistId_countryCode_eventType_period: {
        artistId,
        countryCode,
        eventType,
        period,
      },
    },
    create: {
      artistId,
      countryCode,
      countryName: countryNames[countryCode] ?? countryCode,
      eventType,
      count: 1,
      period,
    },
    update: { count: { increment: 1 } },
  });
}

// ── CREATOR ANALYTICS DASHBOARD ──────────────────────────────

export async function getCreatorAnalytics(artistId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const [rollups, geoData, recentPurchases, followerCount, totalPlays] = await Promise.all([
    // Daily rollups for the period
    prisma.analyticsDailyRollup.findMany({
      where: { artistId, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),

    // Geography breakdown
    prisma.geographyEvent.findMany({
      where: { artistId, eventType: 'play' },
      orderBy: { count: 'desc' },
      take: 10,
    }),

    // Recent sales
    prisma.purchase.findMany({
      where: {
        status: 'confirmed',
        OR: [{ beat: { artistId } }, { release: { artistId } }],
      },
      include: {
        beat: { select: { title: true } },
        release: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),

    // Follower count
    prisma.follow.count({ where: { artistId } }),

    // Total plays
    prisma.artist.findUnique({ where: { id: artistId }, select: { totalPlays: true } }),
  ]);

  // Aggregate rollup data
  const totals = rollups.reduce(
    (acc, r) => ({
      profileViews: acc.profileViews + r.profileViews,
      beatPlays: acc.beatPlays + r.beatPlays,
      releasePlays: acc.releasePlays + r.releasePlays,
      videoPlays: acc.videoPlays + r.videoPlays,
      beatSales: acc.beatSales + r.beatSales,
      releaseSales: acc.releaseSales + r.releaseSales,
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      newFollowers: acc.newFollowers + r.followers,
      likes: acc.likes + r.likes,
      comments: acc.comments + r.comments,
      reposts: acc.reposts + r.reposts,
    }),
    {
      profileViews: 0, beatPlays: 0, releasePlays: 0, videoPlays: 0,
      beatSales: 0, releaseSales: 0, totalRevenue: 0, newFollowers: 0,
      likes: 0, comments: 0, reposts: 0,
    }
  );

  // Chart series (daily breakdown)
  const charts = {
    plays: rollups.map((r) => ({
      date: r.date,
      beats: r.beatPlays,
      releases: r.releasePlays,
      videos: r.videoPlays,
      total: r.beatPlays + r.releasePlays + r.videoPlays,
    })),
    revenue: rollups.map((r) => ({ date: r.date, amount: r.totalRevenue })),
    followers: rollups.map((r) => ({ date: r.date, gained: r.followers, lost: r.unfollows })),
    engagement: rollups.map((r) => ({ date: r.date, likes: r.likes, comments: r.comments, reposts: r.reposts })),
  };

  return {
    summary: {
      ...totals,
      followerCount,
      totalPlays: totalPlays?.totalPlays ?? 0,
      periodDays: days,
    },
    charts,
    geography: geoData,
    recentSales: recentPurchases,
  };
}

// ── AUDIENCE ANALYTICS ────────────────────────────────────────

export async function getAudienceAnalytics(artistId: string) {
  const [
    followerGrowth,
    topCountries,
    totalFollowers,
    memberCount,
    purchaserCount,
  ] = await Promise.all([
    // 30-day follower growth
    prisma.analyticsDailyRollup.findMany({
      where: { artistId },
      select: { date: true, followers: true, unfollows: true },
      orderBy: { date: 'desc' },
      take: 30,
    }),

    // Top countries (all-time plays)
    prisma.geographyEvent.findMany({
      where: { artistId, eventType: 'play' },
      orderBy: { count: 'desc' },
      take: 15,
    }),

    prisma.follow.count({ where: { artistId } }),

    // Active members
    prisma.creatorMembership.count({ where: { artistId, status: 'active' } }),

    // Unique purchasers
    prisma.purchase.groupBy({
      by: ['buyerEmail'],
      where: {
        status: 'confirmed',
        OR: [{ beat: { artistId } }, { release: { artistId } }],
      },
      _count: true,
    }).then((g) => g.length),
  ]);

  return {
    totalFollowers,
    memberCount,
    purchaserCount,
    followerGrowthChart: followerGrowth.reverse(),
    topCountries,
  };
}

// ── REVENUE ANALYTICS ─────────────────────────────────────────

export async function getRevenueAnalytics(artistId: string, months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 7);

  const [revenueRecords, topBeats, topReleases, conversionData] = await Promise.all([
    // Monthly revenue records
    prisma.revenueRecord.findMany({
      where: { artistId, period: { gte: sinceStr } },
      orderBy: { period: 'asc' },
    }),

    // Top-selling beats
    prisma.beat.findMany({
      where: { artistId, sales: { gt: 0 } },
      select: { id: true, title: true, slug: true, sales: true, plays: true, basicPrice: true },
      orderBy: { sales: 'desc' },
      take: 10,
    }),

    // Top-selling releases
    prisma.release.findMany({
      where: { artistId, sales: { gt: 0 } },
      select: { id: true, title: true, slug: true, sales: true, plays: true, price: true },
      orderBy: { sales: 'desc' },
      take: 10,
    }),

    // Conversion rates (plays → purchases)
    prisma.beat.aggregate({ where: { artistId }, _sum: { plays: true, sales: true } }),
  ]);

  const totalPlays = conversionData._sum.plays ?? 0;
  const totalSales = conversionData._sum.sales ?? 0;
  const conversionRate = totalPlays > 0 ? (totalSales / totalPlays) * 100 : 0;

  // Revenue breakdown by source — computed from individual RevenueRecord.type values
  const breakdown = revenueRecords.length > 0
    ? revenueRecords.reduce(
        (acc, r) => {
          const amount = r.netAmount || r.amount;
          switch (r.type) {
            case 'beat_sale':       acc.beatSales     += amount; break;
            case 'release_sale':    acc.releaseSales  += amount; break;
            case 'subscription':    acc.subscriptions += amount; break;
            case 'marketplace':     acc.marketplace   += amount; break;
            case 'support':
            case 'tip':             acc.tips          += amount; break;
            case 'distribution':    acc.distribution  += amount; break;
          }
          return acc;
        },
        { beatSales: 0, releaseSales: 0, subscriptions: 0, marketplace: 0, tips: 0, distribution: 0 }
      )
    : null;

  return {
    monthlyRevenue: revenueRecords,
    topBeats,
    topReleases,
    conversionRate: parseFloat(conversionRate.toFixed(2)),
    totalSales,
    totalPlays,
    breakdown,
  };
}

// ── ENGAGEMENT ANALYTICS ──────────────────────────────────────

export async function getEngagementAnalytics(artistId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const rollups = await prisma.analyticsDailyRollup.findMany({
    where: { artistId, date: { gte: since } },
    select: { date: true, likes: true, comments: true, reposts: true, shares: true },
    orderBy: { date: 'asc' },
  });

  const totals = rollups.reduce(
    (acc, r) => ({
      likes: acc.likes + r.likes,
      comments: acc.comments + r.comments,
      reposts: acc.reposts + r.reposts,
      shares: acc.shares + r.shares,
    }),
    { likes: 0, comments: 0, reposts: 0, shares: 0 }
  );

  const totalEngagements = totals.likes + totals.comments + totals.reposts + totals.shares;

  // Comment activity on posts
  const recentComments = await prisma.postComment.findMany({
    where: {
      post: { artistId },
      isDeleted: false,
      createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    summary: { ...totals, totalEngagements },
    dailyChart: rollups,
    recentComments,
  };
}

// ── STREAM ANALYTICS FOUNDATIONS ─────────────────────────────

/** Record a play event — debounced. Also updates geography. */
export async function recordPlay(data: {
  artistId: string;
  itemType: 'beat' | 'release' | 'video';
  itemId: string;
  country?: string;
  userId?: string;
}) {
  const fieldMap = { beat: 'beatPlays', release: 'releasePlays', video: 'videoPlays' } as const;
  const field = fieldMap[data.itemType];
  if (!field) return;

  await incrementDailyRollup(data.artistId, field);

  if (data.country) {
    await upsertGeographyEvent(data.artistId, data.country, 'play');
  }
}

// ── ADMIN PLATFORM ANALYTICS ──────────────────────────────────

export async function getPlatformAnalytics() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const [
    totalUsers, totalArtists, totalBeats, totalReleases,
    monthRevenue, totalRevenue, newUsersMonth,
    topArtists, recentPurchases,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.artist.count({ where: { isPublic: true } }),
    prisma.beat.count({ where: { isActive: true } }),
    prisma.release.count({ where: { isActive: true } }),
    prisma.purchase.aggregate({
      where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
    prisma.purchase.aggregate({
      where: { status: 'confirmed' },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.artist.findMany({
      where: { isPublic: true },
      select: {
        id: true, name: true, slug: true, photoUrl: true, totalPlays: true,
        _count: { select: { followers: true } },
      },
      orderBy: { totalPlays: 'desc' },
      take: 10,
    }),
    prisma.purchase.findMany({
      where: { status: 'confirmed' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    totals: {
      users: totalUsers,
      artists: totalArtists,
      beats: totalBeats,
      releases: totalReleases,
      newUsersMonth,
    },
    revenue: {
      monthly: monthRevenue._sum.amount ?? 0,
      total: totalRevenue._sum.amount ?? 0,
    },
    topArtists,
    recentPurchases,
  };
}

// ── STREAMING ANALYTICS (Phase 10 additions) ─────────────────

/**
 * Get DSP/platform-level streaming breakdown for an artist.
 * Reads from AnalyticsEvent where platform is stored.
 */
export async function getStreamingBreakdown(artistId: string, days = 30) {
  // AnalyticsEvent table not yet in schema — return empty breakdown gracefully.
  // When the table is added, replace this with a proper groupBy query.
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = await queryRaw<any>(
      `SELECT platform, COUNT(id)::int AS cnt
         FROM "AnalyticsEvent"
        WHERE "userId" = $1
          AND "eventType" = 'play'
          AND "occurredAt" >= $2::timestamptz
          AND platform IS NOT NULL
        GROUP BY platform
        ORDER BY cnt DESC`,
      artistId, since,
    );
    const total = rows.reduce((s: number, e: any) => s + (e.cnt ?? 0), 0) || 1;
    return rows.map((e: any) => ({
      platform: e.platform ?? 'Unknown',
      streams: e.cnt ?? 0,
      pct: parseFloat((((e.cnt ?? 0) / total) * 100).toFixed(1)),
    }));
  } catch {
    return [];
  }
}

/**
 * Get artist-level time series for streams per day (from AnalyticsEvent).
 */
export async function getStreamTimeSeries(artistId: string, days = 30) {
  // AnalyticsEvent table not yet in schema — return zero-filled series gracefully.
  const since = new Date(Date.now() - days * 86_400_000);
  const byDay: Record<string, number> = {};

  try {
    const rows = await queryRaw<any>(
      `SELECT DATE("occurredAt")::text AS day, COUNT(id)::int AS cnt
         FROM "AnalyticsEvent"
        WHERE "userId" = $1
          AND "eventType" = 'play'
          AND "occurredAt" >= $2::timestamptz
        GROUP BY DATE("occurredAt")
        ORDER BY day ASC`,
      artistId, since.toISOString(),
    );
    rows.forEach((r: any) => { byDay[r.day] = r.cnt ?? 0; });
  } catch {
    // Table doesn't exist yet — byDay stays empty, series filled with zeros below
  }

  const result: { date: string; streams: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    result.push({ date: d, streams: byDay[d] ?? 0 });
  }
  return result;
}

/**
 * Admin conversion funnel: registered → first upload → distributed → earning.
 */
export async function getConversionFunnel() {
  const [total, hasUpload, hasDistribution, hasEarnings] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { tracks: { some: {} } } }).catch(() => 0),
    // Use Artist model as proxy for distribution
    prisma.artist.count().catch(() => 0),
    // Users with at least one RevenueRecord
    prisma.revenueRecord?.count ? prisma.revenueRecord.count({ where: { netAmount: { gt: 0 } } }).catch(() => 0) : Promise.resolve(0),
  ]);

  return [
    { stage: 'Registered',    count: total },
    { stage: 'First Upload',  count: hasUpload },
    { stage: 'Distributed',   count: hasDistribution },
    { stage: 'Has Earnings',  count: hasEarnings },
  ];
}

/**
 * Admin: top artists by total plays (for admin analytics dashboard).
 */
export async function getTopArtistsByPlays(limit = 20) {
  return prisma.artist.findMany({
    where: { isPublic: true },
    select: {
      id: true, name: true, slug: true, photoUrl: true, totalPlays: true,
      _count: { select: { followers: true } },
    },
    orderBy: { totalPlays: 'desc' },
    take: limit,
  }).catch(() => []);
}
