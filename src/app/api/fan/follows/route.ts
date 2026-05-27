export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const follows = await prisma.follow.findMany({
    where: { userId: user.id },
    include: {
      artist: {
        select: {
          id: true,
          name: true,
          slug: true,
          photoUrl: true,
          coverUrl: true,
          bio: true,
          city: true,
          country: true,
          genreTags: true,
          beats: { where: { isActive: true }, select: { id: true } },
          releases: { where: { isActive: true }, select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ follows: follows.map((f: any) => f.artist) });
}
