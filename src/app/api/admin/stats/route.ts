export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [
      totalUsers,
      totalSales,
      revenueAgg,
      totalReleases,
      pendingReleases,
      pendingPayouts,
      industryRevenueRaw,
      industryOrderCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.purchase.count({ where: { status: 'confirmed' } }),
      prisma.purchase.aggregate({
        where: { status: 'confirmed' },
        _sum: { platformFee: true, amount: true },
      }),
      prisma.distributionRelease.count(),
      prisma.distributionRelease.count({ where: { status: 'metadata_review' } }),
      prisma.payoutRequest.count({ where: { status: 'pending' } }),
      // Industry service orders (separate table, no Purchase record)
      prisma.$queryRaw<Array<{ total: number; fees: number }>>`
        SELECT
          COALESCE(SUM(amount), 0)::float         AS total,
          COALESCE(SUM("platformFee"), 0)::float  AS fees
        FROM "IndustryServiceOrder"
        WHERE status IN ('paid', 'delivered', 'completed')
      `,
      prisma.$queryRaw<Array<{ cnt: number }>>`
        SELECT COUNT(*)::int AS cnt
        FROM "IndustryServiceOrder"
        WHERE status IN ('paid', 'delivered', 'completed')
      `,
    ]);

    const industryRevenue     = Number((industryRevenueRaw as any)[0]?.total ?? 0);
    const industryPlatformFee = Number((industryRevenueRaw as any)[0]?.fees  ?? 0);
    const industryOrders      = Number((industryOrderCount  as any)[0]?.cnt  ?? 0);

    return NextResponse.json({
      totalUsers,
      totalSales:      totalSales + industryOrders,
      revenue:         (revenueAgg._sum.amount      || 0) + industryRevenue,
      platformEarnings: (revenueAgg._sum.platformFee || 0) + industryPlatformFee,
      totalReleases,
      pendingReleases,
      pendingPayouts,
    });
  } catch (err) {
    console.error('[admin/stats] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
