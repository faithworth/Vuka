/**
 * GET /api/admin/audit?category=all|auth|payment|content|moderation|admin|security&page=1&q=
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') || 'all';
  const q        = searchParams.get('q')        || '';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit    = 100;

  try {
    const where: any = {};
    if (category !== 'all') where.action = { startsWith: category };
    if (q) {
      where.OR = [
        { action:     { contains: q, mode: 'insensitive' } },
        { targetId:   { contains: q, mode: 'insensitive' } },
        { targetType: { contains: q, mode: 'insensitive' } },
        { notes:      { contains: q, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.adminLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[admin/audit] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
