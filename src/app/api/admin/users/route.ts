// Legacy route — kept for backward compat with existing admin page.
// Full user management is at /api/admin/users-manage.
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, name: true, email: true, role: true, createdAt: true, isSuspended: true },
  });
  return NextResponse.json({ users });
}
