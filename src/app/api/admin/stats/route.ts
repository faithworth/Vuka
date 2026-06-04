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
    ]);

    return NextResponse.json({
      totalUsers,
      totalSales,
      revenue:         revenueAgg._sum.amount      || 0,
      platformEarnings: revenueAgg._sum.platformFee || 0,
      totalReleases,
      pendingReleases,
      pendingPayouts,
    });
  } catch (err) {
    console.error('[admin/stats] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
