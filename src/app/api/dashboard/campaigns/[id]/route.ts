// GET    /api/dashboard/campaigns/[id] — single campaign detail
// PATCH  /api/dashboard/campaigns/[id] — update (draft only) or publish
// DELETE /api/dashboard/campaigns/[id] — delete (draft only)

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const campaign = await prisma.campaign.findFirst({
      where:   { id: params.id, artistId: user.artist.id },
      include: {
        tiers:   { orderBy: { amount: 'asc' } },
        backers: { where: { status: 'confirmed' }, orderBy: { createdAt: 'desc' }, take: 50 },
        _count:  { select: { backers: true } },
      },
    });
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const daysLeft = Math.max(0, Math.ceil((new Date(campaign.deadline).getTime() - Date.now()) / 86_400_000));
    const pct      = Math.min(100, Math.round((campaign.currentAmount / campaign.targetAmount) * 100));

    return NextResponse.json({ campaign, daysLeft, pct });
  } catch (err) {
    console.error('[campaign/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, artistId: user.artist.id },
    });
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();

    // Publish action
    if (body.action === 'publish') {
      if (campaign.status !== 'draft') {
        return NextResponse.json({ error: 'Only draft campaigns can be published' }, { status: 400 });
      }
      const updated = await prisma.campaign.update({
        where: { id: params.id },
        data:  { status: 'active' },
        include: {
          tiers:   { orderBy: { amount: 'asc' } },
          backers: { where: { status: 'confirmed' }, orderBy: { createdAt: 'desc' }, take: 50 },
          _count:  { select: { backers: true } },
        },
      });
      return NextResponse.json({ ok: true, campaign: updated });
    }

    // General edit — only while draft
    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'Published campaigns cannot be edited. Contact support.' }, { status: 400 });
    }

    const { title, description, coverUrl, targetAmount, deadline, campaignType } = body;
    const updated = await prisma.campaign.update({
      where: { id: params.id },
      data:  {
        ...(title         && { title: title.trim() }),
        ...(description !== undefined && { description }),
        ...(coverUrl    !== undefined && { coverUrl }),
        ...(targetAmount  && { targetAmount: parseFloat(targetAmount) }),
        ...(deadline      && { deadline: new Date(deadline) }),
        ...(campaignType  && { campaignType }),
      },
      include: {
        tiers:   { orderBy: { amount: 'asc' } },
        backers: { where: { status: 'confirmed' }, orderBy: { createdAt: 'desc' }, take: 50 },
        _count:  { select: { backers: true } },
      },
    });
    return NextResponse.json({ ok: true, campaign: updated });
  } catch (err) {
    console.error('[campaign/PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, artistId: user.artist.id },
    });
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be deleted.' }, { status: 400 });
    }

    await prisma.campaign.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[campaign/DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
