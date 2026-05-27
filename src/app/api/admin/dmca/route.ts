export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

export async function GET() {
  const user = await getServerUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const reports = await prisma.dMCAReport.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ reports });
}
