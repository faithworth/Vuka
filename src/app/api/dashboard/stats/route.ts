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

    const [purchases, monthPurchases, beats, releases] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [{ beat: { artistId } }, { release: { artistId } }],
        },
        include: { beat: { select: { title: true } }, release: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.purchase.aggregate({
        where: {
          status: 'confirmed',
          createdAt: { gte: monthStart },
          OR: [{ beat: { artistId } }, { release: { artistId } }],
        },
        _sum: { amount: true },
      }),
      prisma.beat.aggregate({ where: { artistId }, _sum: { plays: true, sales: true } }),
      prisma.release.aggregate({ where: { artistId }, _sum: { plays: true, sales: true } }),
    ]);

    const totalRevenue = purchases.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
    const monthRevenue = monthPurchases._sum.amount || 0;
    const totalPlays = (beats._sum.plays || 0) + (releases._sum.plays || 0);
    const totalSales = (beats._sum.sales || 0) + (releases._sum.sales || 0);

    return NextResponse.json({ totalRevenue, monthRevenue, totalPlays, totalSales, recentSales: purchases, artistSlug: user.artist.slug });
  } catch (err) {
    console.error('DB error (stats):', err);
    return NextResponse.json({ totalRevenue: 0, monthRevenue: 0, totalPlays: 0, totalSales: 0, recentSales: [], dbError: true });
  }
}
