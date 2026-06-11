/**
 * GET /api/admin/users?q=&role=all&page=1
 * Uses $queryRaw so it works regardless of Prisma client version —
 * planSlug/planExpiresAt are read directly from the DB.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma, { queryRaw, executeRaw } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q     = searchParams.get('q') || searchParams.get('search') || '';
  const role  = (searchParams.get('role') || 'all').toLowerCase();
  const page  = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    // Build dynamic WHERE clauses
    const conditions: string[] = [];
    const params: any[]        = [];
    let   pi                   = 1; // param index

    if (q) {
      conditions.push(`(u.name ILIKE $${pi} OR u.email ILIKE $${pi})`);
      params.push(`%${q}%`);
      pi++;
    }
    if (role !== 'all') {
      conditions.push(`u.role = $${pi}`);
      params.push(role);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Raw query — works with any Prisma client version
    const [rows, countRows] = await Promise.all([
      queryRaw(`
        SELECT
          u.id, u.name, u.email, u.role, u."createdAt", u."isSuspended",
          a.id          AS "artistId",
          a.slug        AS "artistSlug",
          a.name        AS "artistName",
          a."isVerified",
          a."planSlug",
          a."planExpiresAt",
          a."totalPlays",
          (SELECT COUNT(*) FROM "Purchase" p WHERE p."userId" = u.id)::int AS purchases
        FROM "User" u
        LEFT JOIN "Artist" a ON a."userId" = u.id
        ${where}
        ORDER BY u."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `, ...params),
      queryRaw(`
        SELECT COUNT(*)::int AS total FROM "User" u ${where}
      `, ...params),
    ]);

    const total = countRows[0]?.total ?? 0;

    // Reshape to match the shape the frontend expects
    const users = rows.map(r => ({
      id:          r.id,
      name:        r.name,
      email:       r.email,
      role:        r.role,
      createdAt:   r.createdAt,
      isSuspended: r.isSuspended,
      artist: r.artistId ? {
        id:          r.artistId,
        slug:        r.artistSlug,
        name:        r.artistName,
        isVerified:  r.isVerified,
        planSlug:    r.planSlug ?? 'free',
        planExpiresAt: r.planExpiresAt ?? null,
        totalPlays:  r.totalPlays ?? 0,
      } : null,
      _count: { purchases: r.purchases ?? 0 },
    }));

    return NextResponse.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[admin/users] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
