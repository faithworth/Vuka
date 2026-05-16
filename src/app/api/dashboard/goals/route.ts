export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const goals = await prisma.goal.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ goals });
  } catch (err) {
    console.error('[goals] GET error:', err);
    return NextResponse.json({ goals: [], dbError: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { title, description, targetAmount, deadline } = await req.json();
    const goal = await prisma.goal.create({
      data: {
        artistId: user.artist.id,
        title,
        description: description || '',
        targetAmount: parseFloat(targetAmount),
        deadline: deadline ? new Date(deadline) : null,
      },
    });
    return NextResponse.json({ goal });
  } catch (err) {
    console.error('[goals] POST error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, isActive } = await req.json();
    const goal = await prisma.goal.updateMany({
      where: { id, artistId: user.artist.id },
      data: { isActive },
    });
    return NextResponse.json({ goal });
  } catch (err) {
    console.error('[goals] PATCH error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
