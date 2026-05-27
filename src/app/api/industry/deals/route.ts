// ============================================================
// PATCH 11c — NEW FILE: src/app/api/industry/deals/route.ts
// Copy this as a standalone file at that path.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const deals = await prisma.deal.findMany({ where: { industryUserId: iu.id }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ deals });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { title, description, artistSlug, dealType, offerAmount, currency } = await req.json();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const deal = await prisma.deal.create({
      data: {
        industryUserId: iu.id,
        title,
        description: description || '',
        artistSlug: artistSlug || '',
        dealType: dealType || 'licensing',
        offerAmount: offerAmount || 0,
        currency: currency || 'ZAR',
      },
    });
    return NextResponse.json({ deal });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
