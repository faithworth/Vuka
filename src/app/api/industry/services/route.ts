// src/app/api/industry/services/route.ts
// Industry professionals manage their service listings.
// GET  → list own services
// POST → create new service

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma, { queryRaw, executeRaw } from '@/lib/prisma';

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

    const id = crypto.randomUUID();
    const now = new Date();

    await executeRaw(
      `INSERT INTO "IndustryService"
         (id, "industryUserId", title, description, category, "priceZAR", "pricingModel", "deliveryDays", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9::timestamptz, $9::timestamptz)`,
      id,
      iu.id,
      title.trim(),
      description?.trim() || '',
      category || 'promotion',
      parseFloat(priceZAR),
      pricingModel || 'fixed',
      parseInt(deliveryDays) || 7,
      now,
    );

    const service = await queryRaw(
      `SELECT * FROM "IndustryService" WHERE id = $1`,
      id,
    ).then(rows => rows[0]);

    return NextResponse.json({ service });
  } catch (err) {
    console.error('[industry/services POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
