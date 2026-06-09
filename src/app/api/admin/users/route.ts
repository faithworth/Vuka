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

/** True if this is a Prisma unknown-field validation error for planSlug / planExpiresAt */
function isPlanFieldError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('planSlug') || msg.includes('planExpiresAt') || msg.includes('Unknown field');
}

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

    // Try with plan fields first (works once migration + client regeneration has run).
    // Fall back to without plan fields if Prisma or DB rejects them.
    async function fetchWithPlan() {
      return prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          isSuspended: true,
          artist: {
            select: {
              id: true,
              slug: true,
              name: true,
              isVerified: true,
              planSlug: true,
              planExpiresAt: true,
              totalPlays: true,
            } as any,
          },
          _count: { select: { purchases: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      });
    }

    async function fetchWithoutPlan() {
      return prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          isSuspended: true,
          artist: {
            select: {
              id: true,
              slug: true,
              name: true,
              isVerified: true,
              totalPlays: true,
            },
          },
          _count: { select: { purchases: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      });
    }

    let users: any[];
    let usePlan = true;

    try {
      users = await fetchWithPlan();
    } catch (planErr) {
      if (isPlanFieldError(planErr)) {
        usePlan = false;
        users = await fetchWithoutPlan();
      } else {
        throw planErr;
      }
    }

    const total = await prisma.user.count({ where });

    // Normalise: ensure artist always has planSlug/planExpiresAt keys
    if (!usePlan) {
      users = users.map(u => ({
        ...u,
        artist: u.artist ? { ...u.artist, planSlug: 'free', planExpiresAt: null } : null,
      }));
    }

    return NextResponse.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[admin/users] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
