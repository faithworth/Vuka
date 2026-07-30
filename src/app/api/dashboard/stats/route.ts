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

    const [recentPurchases, payoutRows, beats, releases] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [
            { beat:    { artistId } },
            { release: { artistId } },
            { video:   { artistId } },
            { sample:  { artistId } },
            { merch:   { artistId } },
            { artistId },
          ],
        },
        include: {
          beat:    { select: { title: true } },
          release: { select: { title: true } },
          video:   { select: { title: true } },
          sample:  { select: { title: true } },
          merch:   { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      // Same ledger Payouts' 'Total Earned' reads from — every revenue-
      // confirming webhook (sales, tips, memberships, marketplace, tickets,
      // campaigns, industry orders) writes an ArtistPayout row, so this is
      // the one source of truth both pages should agree on.
      prisma.artistPayout.findMany({
        where: { artistId },
        select: { amount: true, createdAt: true },
      }),
      prisma.beat.aggregate({ where: { artistId }, _sum: { plays: true, sales: true } }),
      prisma.release.aggregate({ where: { artistId }, _sum: { plays: true, sales: true } }),
    ]);

    const totalRevenue = payoutRows.reduce((sum, p) => sum + p.amount, 0);
    const monthRevenue = payoutRows.filter(p => p.createdAt >= monthStart).reduce((sum, p) => sum + p.amount, 0);
    const totalPlays = (beats._sum.plays || 0) + (releases._sum.plays || 0);
    const totalSales = (beats._sum.sales || 0) + (releases._sum.sales || 0);

    return NextResponse.json({ totalRevenue, monthRevenue, totalPlays, totalSales, recentSales: recentPurchases, artistSlug: user.artist.slug });
  } catch (err) {
    console.error('DB error (stats):', err);
    return NextResponse.json({ totalRevenue: 0, monthRevenue: 0, totalPlays: 0, totalSales: 0, recentSales: [], dbError: true });
  }
}
