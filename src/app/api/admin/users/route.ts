export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

export async function GET() {
  const user = await getServerUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, email: true, role: true, createdAt: true } });
  return NextResponse.json({ users });
}
