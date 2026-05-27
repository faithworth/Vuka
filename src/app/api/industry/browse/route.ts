// src/app/api/industry/browse/route.ts
// Public — any logged-in artist can browse industry service listings.
// GET ?category=promotion&sort=price_asc

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    const sort = searchParams.get('sort') || 'price_asc';

    const orderBy: any =
      sort === 'price_asc'  ? { priceZAR: 'asc' } :
      sort === 'price_desc' ? { priceZAR: 'desc' } :
      sort === 'newest'     ? { createdAt: 'desc' } :
                              { priceZAR: 'asc' };

    const services = await prisma.industryService.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
      },
      include: {
        industryUser: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy,
    });

    return NextResponse.json({ services });
  } catch (err) {
    console.error('[industry/browse GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
