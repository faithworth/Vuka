// GET /api/cms/featured-artists/search?q=name
// Dedicated artist-by-name search for the Featured Artists picker.
// Returns artists in the exact shape the CMS admin UI expects.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10'), 25);

    if (q.length < 2) return NextResponse.json({ artists: [] });

    const artists = await prisma.artist.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q.toLowerCase(), mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ isVerified: 'desc' }, { totalPlays: 'desc' }],
      take: limit,
      select: {
        id: true, slug: true, name: true, photoUrl: true,
        genreTags: true, city: true, isVerified: true,
      },
    });

    return NextResponse.json({ artists });
  } catch (e) {
    console.error('[cms/featured-artists/search]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
