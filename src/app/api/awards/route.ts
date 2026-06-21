export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  const awards = await prisma.award.findMany({
    where: { status: { not: 'draft' } },
    include: {
      categories: {
        include: {
          nominations: {
            include: { artist: { select: { name: true, slug: true, photoUrl: true } } },
            orderBy: { finalScore: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { year: 'desc' },
  });
  return NextResponse.json({ awards });
}
