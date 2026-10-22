// ============================================================
// src/app/api/industry/me/route.ts
// Loads the industry portal and repairs missing profiles for existing
// industry-role users before returning dashboard data.
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

    // Repair accounts where the User row exists but profile creation previously failed.
    // The upsert is safe to retry and avoids a race on the unique userId.
    const industryUser = await prisma.industryUser.upsert({
      where: { userId: user.id },
      create: { userId: user.id, companyName: '' },
      update: {},
      include: {
        referrals: { orderBy: { createdAt: 'desc' }, take: 50 },
        deals: { orderBy: { createdAt: 'desc' } },
        services: {
          include: {
            inquiries: {
              include: {
                artist: {
                  select: {
                    slug: true,
                    name: true,
                    photoUrl: true,
                    userId: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { currency: true },
    });

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, currency: userDetails?.currency || 'ZAR' },
      industryUser,
      referrals: industryUser.referrals,
      deals: industryUser.deals,
      services: industryUser.services,
    });
  } catch (err) {
    console.error('[industry/me]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
