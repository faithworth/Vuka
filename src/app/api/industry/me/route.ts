// ============================================================
// PATCH 11b — NEW FILE: src/app/api/industry/me/route.ts
// Returns the current industry user's profile + stats.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'industry') return NextResponse.json({ error: 'Not an industry account' }, { status: 403 });

    const industryUser = await prisma.industryUser.findUnique({
      where: { userId: user.id },
      include: {
        referrals: { orderBy: { createdAt: 'desc' }, take: 50 },
        deals: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!industryUser) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      industryUser,
      referrals: industryUser.referrals,
      deals: industryUser.deals,
    });
  } catch (err) {
    console.error('[industry/me]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

