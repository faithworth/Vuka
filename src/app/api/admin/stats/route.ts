export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

export async function GET() {
  const user = await getServerUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [totalUsers, totalSales, revenueAgg] = await Promise.all([
    prisma.user.count(),
    prisma.purchase.count({ where: { status: 'confirmed' } }),
    prisma.purchase.aggregate({ where: { status: 'confirmed' }, _sum: { platformFee: true, amount: true } }),
  ]);
  return NextResponse.json({
    totalUsers,
    totalSales,
    revenue: revenueAgg._sum.amount || 0,
    platformEarnings: revenueAgg._sum.platformFee || 0,
  });
}
