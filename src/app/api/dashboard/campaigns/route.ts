// GET  /api/dashboard/campaigns — list artist's campaigns
// POST /api/dashboard/campaigns — create a new campaign

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const campaigns = await prisma.campaign.findMany({
      where:   { artistId: user.artist.id },
      include: { tiers: { orderBy: { amount: 'asc' } }, _count: { select: { backers: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error('[campaigns/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { title, description, coverUrl, targetAmount, deadline, campaignType, tiers } = body;

    if (!title?.trim())    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!targetAmount || targetAmount <= 0) return NextResponse.json({ error: 'Target amount must be positive' }, { status: 400 });
    if (!deadline)         return NextResponse.json({ error: 'Deadline is required' }, { status: 400 });

    // Build unique slug
    let slug = slugify(title);
    let attempt = 0;
    while (await prisma.campaign.findUnique({ where: { slug } })) {
      slug = `${slugify(title)}-${++attempt}`;
    }

    // Validate tiers if provided
    if (tiers?.length) {
      const totalPct = tiers.reduce((s: number, t: any) => s + (t.percentage ?? 0), 0);
      if (tiers.some((t: any) => !t.title || !t.amount || t.amount <= 0)) {
        return NextResponse.json({ error: 'Each tier needs a title and positive amount' }, { status: 400 });
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        artistId:     user.artist.id,
        title:        title.trim(),
        description:  description ?? '',
        coverUrl:     coverUrl ?? '',
        targetAmount: parseFloat(targetAmount),
        deadline:     new Date(deadline),
        campaignType: campaignType ?? 'flexible',
        status:       'draft',
        slug,
        tiers: tiers?.length ? {
          create: tiers.map((t: any) => ({
            id:          `ct_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            title:       t.title.trim(),
            description: t.description ?? '',
            amount:      parseFloat(t.amount),
            perks:       t.perks ?? [],
            maxBackers:  t.maxBackers ? parseInt(t.maxBackers) : null,
          })),
        } : undefined,
      },
      include: { tiers: true },
    });

    return NextResponse.json({ ok: true, campaign });
  } catch (err) {
    console.error('[campaigns/POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
