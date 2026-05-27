// src/app/api/industry/services/route.ts
// Industry professionals manage their service listings.
// GET  → list own services
// POST → create new service

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({
      where: { userId: user.id },
      include: {
        services: {
          include: { inquiries: { include: { artist: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!iu) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });
    return NextResponse.json({ services: iu.services });
  } catch (err) {
    console.error('[industry/services GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });

    const { title, description, category, priceZAR, pricingModel, deliveryDays } = await req.json();
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!priceZAR || priceZAR <= 0) return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 });

    const service = await prisma.industryService.create({
      data: {
        industryUserId: iu.id,
        title: title.trim(),
        description: description?.trim() || '',
        category: category || 'promotion',
        priceZAR: parseFloat(priceZAR),
        pricingModel: pricingModel || 'fixed',
        deliveryDays: parseInt(deliveryDays) || 7,
        isActive: true,
      },
    });

    return NextResponse.json({ service });
  } catch (err) {
    console.error('[industry/services POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
