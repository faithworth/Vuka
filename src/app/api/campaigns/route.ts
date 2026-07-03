export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/campaigns?status=active&q=search&cursor=xxx
// Public browse listing — no auth required. Only ever returns campaigns
// that are meant to be publicly visible (never 'draft').
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'active'; // active | funded | all
  const q      = searchParams.get('q')?.trim() || '';
  const cursor = searchParams.get('cursor') || undefined;
  const take   = 24;

  const where: any = {
    status: status === 'all' ? { in: ['active', 'funded'] } : status,
    ...(q && { title: { contains: q, mode: 'insensitive' } }),
  };

  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: {
      artist: { select: { name: true, slug: true, photoUrl: true } },
      _count: { select: { backers: { where: { status: 'confirmed' } } } },
    },
  });

  const hasMore = campaigns.length > take;
  const page = hasMore ? campaigns.slice(0, take) : campaigns;

  return NextResponse.json({
    campaigns: page.map(c => ({
      id: c.id, title: c.title, description: c.description, coverUrl: c.coverUrl,
      targetAmount: c.targetAmount, currentAmount: c.currentAmount, currency: c.currency,
      deadline: c.deadline, campaignType: c.campaignType, status: c.status, slug: c.slug,
      backerCount: c._count.backers, artist: c.artist,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
