/**
 * GET  /api/admin/users?q=search&role=all|artist|fan|admin|industry&page=1
 *
 * Full user listing with artist profile data.
 * This is the route the admin users page calls for its table.
 * POST actions (suspend, verify, set_plan, etc.) go to /api/admin/users-manage.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q     = searchParams.get('q')    || searchParams.get('search') || '';
  const role  = (searchParams.get('role') || 'all').toLowerCase();
  const page  = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = 50;

  try {
    const where: any = {};
    if (q) {
      where.OR = [
        { name:  { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (role !== 'all') where.role = role;

    // Probe whether Artist.planSlug column exists — may be absent if migration hasn't run yet
    let artistHasPlan = true;
    try {
      await prisma.$queryRaw`SELECT "planSlug" FROM "Artist" LIMIT 1`;
    } catch {
      artistHasPlan = false;
    }

    const artistSelect = artistHasPlan
      ? { id: true, slug: true, name: true, isVerified: true, planSlug: true, planExpiresAt: true, totalPlays: true }
      : { id: true, slug: true, name: true, isVerified: true, totalPlays: true };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          isSuspended: true,
          artist: { select: artistSelect as any },
          _count: { select: { purchases: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[admin/users] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
