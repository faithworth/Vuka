export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artistId = user.artist.id;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [recentPurchases, allRevenue, monthPurchases, beats, releases, mktRevenue, mktMonthRevenue] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [
            { beat: { artistId } },
            { release: { artistId } },
            { artistId },
          ],
        },
        include: { beat: { select: { title: true } }, release: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      // All confirmed revenue from Purchase table (beats, releases, marketplace, memberships)
      prisma.purchase.aggregate({
        where: {
          status: 'confirmed',
          OR: [
            { beat: { artistId } },
            { release: { artistId } },
            { artistId },
          ],
        },
        _sum: { amount: true },
      }),
      prisma.purchase.aggregate({
        where: {
          status: 'confirmed',
          createdAt: { gte: monthStart },
          OR: [
            { beat: { artistId } },
            { release: { artistId } },
            { artistId },
          ],
        },
        _sum: { amount: true },
      }),
      prisma.beat.aggregate({ where: { artistId }, _sum: { plays: true, sales: true } }),
      prisma.release.aggregate({ where: { artistId }, _sum: { plays: true, sales: true } }),
      // Industry service orders revenue (stored separately)
      prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COALESCE(SUM(iso.amount), 0)::float AS total
        FROM "IndustryServiceOrder" iso
        WHERE iso."artistId" = ${artistId}
          AND iso.status IN ('paid', 'delivered', 'completed')
      `,
      prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COALESCE(SUM(iso.amount), 0)::float AS total
        FROM "IndustryServiceOrder" iso
        WHERE iso."artistId" = ${artistId}
          AND iso.status IN ('paid', 'delivered', 'completed')
          AND iso."createdAt" >= ${monthStart}
      `,
    ]);

    const purchaseRevenue = allRevenue._sum.amount || 0;
    const purchaseMonthRevenue = monthPurchases._sum.amount || 0;
    const industryRevenue = Number((mktRevenue as any)[0]?.total ?? 0);
    const industryMonthRevenue = Number((mktMonthRevenue as any)[0]?.total ?? 0);

    const totalRevenue = purchaseRevenue + industryRevenue;
    const monthRevenue = purchaseMonthRevenue + industryMonthRevenue;
    const totalPlays = (beats._sum.plays || 0) + (releases._sum.plays || 0);
    const totalSales = (beats._sum.sales || 0) + (releases._sum.sales || 0);

    return NextResponse.json({ totalRevenue, monthRevenue, totalPlays, totalSales, recentSales: recentPurchases, artistSlug: user.artist.slug });
  } catch (err) {
    console.error('DB error (stats):', err);
    return NextResponse.json({ totalRevenue: 0, monthRevenue: 0, totalPlays: 0, totalSales: 0, recentSales: [], dbError: true });
  }
}
