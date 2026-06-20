export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkAndAwardPlaques } from '@/lib/plaques';

// GET /api/follow?artistId=xxx  — check if following
export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ following: false });
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ following: false });
  const follow = await prisma.follow.findUnique({
    where: { userId_artistId: { userId: user.id, artistId } },
  });
  return NextResponse.json({ following: !!follow });
}

// POST /api/follow — toggle follow
export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { artistId } = await req.json();
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  const existing = await prisma.follow.findUnique({
    where: { userId_artistId: { userId: user.id, artistId } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  }

  await prisma.follow.create({ data: { userId: user.id, artistId } });

  // Check follower_count milestones — fire-and-forget, never blocks the response
  checkAndAwardPlaques(artistId).catch(() => {});

  return NextResponse.json({ following: true });
}
