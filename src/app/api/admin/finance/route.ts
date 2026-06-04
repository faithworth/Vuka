/**
 * GET /api/admin/finance
 * Platform-wide financial overview for the admin dashboard.
 */
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const now     = new Date();
    const month30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const month90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      totalRevenue,
      revenueThisMonth,
      totalPayouts,
      pendingPayouts,
      topArtists,
      recentPayouts,
      salesByType,
    ] = await Promise.all([
      prisma.purchase.aggregate({
        where: { status: 'confirmed' },
        _sum: { platformFee: true, amount: true },
      }),
      prisma.purchase.aggregate({
        where: { status: 'confirmed', createdAt: { gte: month30 } },
        _sum: { platformFee: true, amount: true },
      }),
      prisma.artistPayout.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payoutRequest.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.purchase.groupBy({
        by:    ['artistId'],
        where: { status: 'confirmed' },
        _sum:  { netAmount: true, platformFee: true },
        orderBy: { _sum: { netAmount: 'desc' } },
        take: 10,
      }).then(async (rows) => {
        const ids = rows.map((r) => r.artistId).filter(Boolean) as string[];
        const artists = await prisma.artist.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, slug: true },
        });
        return rows.map((r) => ({
          ...r,
          artist: artists.find((a) => a.id === r.artistId) || null,
        }));
      }),
      prisma.artistPayout.findMany({
        where: { status: 'paid' },
        include: { artist: { select: { name: true, slug: true } } },
        orderBy: { processedAt: 'desc' },
        take: 20,
      }),
      prisma.purchase.groupBy({
        by:    ['itemType'],
        where: { status: 'confirmed', createdAt: { gte: month90 } },
        _sum:  { amount: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      revenue: {
        lifetime:             totalRevenue._sum.amount       || 0,
        platformFee:          totalRevenue._sum.platformFee  || 0,
        thisMonth:            revenueThisMonth._sum.amount   || 0,
        platformFeeThisMonth: revenueThisMonth._sum.platformFee || 0,
      },
      payouts: {
        totalPaid:     totalPayouts._sum.amount  || 0,
        totalPayouts:  totalPayouts._count,
        pendingAmount: pendingPayouts._sum.amount || 0,
        pendingCount:  pendingPayouts._count,
      },
      topArtists,
      recentPayouts,
      salesByType,
    });
  } catch (err) {
    console.error('[admin/finance] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
