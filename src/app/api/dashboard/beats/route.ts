import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const beats = await prisma.beat.findMany({ where: { artistId: user.artist.id }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ beats });
  } catch (err) {
    console.error('DB error:', err);
    return NextResponse.json({ beats: [], dbError: true });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { beatId, isActive, title, basicPrice, premiumPrice, exclPrice, genre, mood, bpm } = await req.json();
    const beat = await prisma.beat.findFirst({ where: { id: beatId, artistId: user.artist.id } });
    if (!beat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.beat.update({
      where: { id: beatId },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(title && { title }),
        ...(basicPrice !== undefined && { basicPrice }),
        ...(premiumPrice !== undefined && { premiumPrice }),
        ...(exclPrice !== undefined && { exclPrice }),
        ...(genre && { genre }),
        ...(mood && { mood }),
        ...(bpm !== undefined && { bpm }),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('DB error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
