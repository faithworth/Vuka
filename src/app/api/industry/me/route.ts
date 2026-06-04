// ============================================================
// src/app/api/industry/me/route.ts
// FIX: inquiry artist select now includes userId so that
//      the industry dashboard's "Message" button can find
//      the artist's user account to open a conversation.
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
        services: {
          include: {
            inquiries: {
              include: {
                // FIX: added userId to artist select so messageArtist() works
                artist: {
                  select: {
                    slug: true,
                    name: true,
                    photoUrl: true,
                    userId: true,   // <-- was missing; caused "Cannot find artist account" error
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

    if (!industryUser) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
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
