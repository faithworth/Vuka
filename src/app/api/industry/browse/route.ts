// FIX: Industry services page was calling /api/industry/browse which requires auth,
// but when a logged-out or unresolved user hit the page the entire list was empty.
// Also: the inquire button was hidden for industry users looking at OTHER services —
// this is intentional, but previously the null guard was wrong so the button vanished
// for artists too when the role string had not yet resolved on mount.
//
// This route now:
// - Returns services for ALL logged-in users (artist, fan, industry).
// - Industry users see all active services EXCEPT their own.
// - Unauthenticated users get the public list (no inquire button shown on frontend).

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    const sort = searchParams.get('sort') || 'price_asc';

    const orderBy: Record<string, string> =
      sort === 'price_asc'  ? { priceZAR: 'asc' }  :
      sort === 'price_desc' ? { priceZAR: 'desc' } :
      sort === 'newest'     ? { createdAt: 'desc' } :
                              { priceZAR: 'asc' };

    // Get user (optional — public browse is allowed)
    let excludeIndustryUserId: string | undefined;
    try {
      const user = await getServerUser();
      if (user?.role === 'industry' && user.industryUser) {
        // Industry users shouldn't see their own services in browse
        excludeIndustryUserId = user.industryUser.id;
      }
    } catch { /* unauthenticated — return public list */ }

    const services = await prisma.industryService.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
        ...(excludeIndustryUserId
          ? { industryUserId: { not: excludeIndustryUserId } }
          : {}),
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
