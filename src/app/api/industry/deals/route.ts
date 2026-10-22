export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });
    const deals = await prisma.deal.findMany({ where: { industryUserId: iu.id }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ deals });
  } catch (err) {
    console.error('[industry/deals GET] database error:', err);
    return NextResponse.json({ error: 'Could not load deals. Please try again.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });

    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const artistSlug = typeof body.artistSlug === 'string' ? body.artistSlug.trim() : '';
    const dealType = typeof body.dealType === 'string' ? body.dealType : 'licensing';
    const offerAmount = body.offerAmount === '' || body.offerAmount == null ? 0 : Number(body.offerAmount);
    const currency = typeof body.currency === 'string' ? body.currency : 'ZAR';

    if (!title) return NextResponse.json({ error: 'Deal title is required' }, { status: 400 });
    if (!Number.isFinite(offerAmount) || offerAmount < 0) {
      return NextResponse.json({ error: 'Offer amount must be zero or greater' }, { status: 400 });
    }
    const allowedTypes = ['licensing', 'publishing', 'management', 'distribution', 'sync', 'sponsorship', 'other'];
    if (!allowedTypes.includes(dealType)) return NextResponse.json({ error: 'Invalid deal type' }, { status: 400 });

    const deal = await prisma.deal.create({
      data: { industryUserId: iu.id, title, description, artistSlug, dealType, offerAmount, currency },
    });
    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    console.error('[industry/deals POST] failed to create offer:', err);
    return NextResponse.json({ error: 'Could not save offer. Please try again; the failure has been logged.' }, { status: 500 });
  }
}
