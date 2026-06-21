export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
type P = { params: { slug: string } };
export async function GET(_: NextRequest, { params }: P) {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: params.slug },
    include: { tiers: { orderBy: { amount: 'asc' } }, artist: { select: { name: true, slug: true, photoUrl: true } }, _count: { select: { backers: { where: { status: 'confirmed' } } } } },
  });
  if (!campaign || campaign.status === 'draft') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const tiersWithCounts = await Promise.all(campaign.tiers.map(async t => {
    const count = await prisma.campaignBacker.count({ where: { tierId: t.id, status: 'confirmed' } });
    return { ...t, backerCount: count, available: t.maxBackers ? t.maxBackers - count : null };
  }));
  return NextResponse.json({ campaign: { ...campaign, backerCount: campaign._count.backers, tiers: tiersWithCounts } });
}
