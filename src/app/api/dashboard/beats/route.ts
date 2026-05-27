// ============================================================
// PATCH 07 — src/app/api/dashboard/beats/route.ts
// REPLACE entire file.
// Adds:
//   - DELETE method with guard: cannot delete exclusively sold beats
//   - Also cannot delete if there are any confirmed purchases
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const beats = await prisma.beat.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
    });
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

    // Cannot re-activate an exclusively sold beat
    if (isActive === true && beat.isExclusive) {
      return NextResponse.json({ error: 'This beat was sold exclusively and cannot be re-listed.' }, { status: 409 });
    }

    const updated = await prisma.beat.update({
      where: { id: beatId },
      data: {
        ...(isActive !== undefined && !beat.isExclusive && { isActive }),
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

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const beatId = searchParams.get('beatId');
    if (!beatId) return NextResponse.json({ error: 'beatId required' }, { status: 400 });

    const beat = await prisma.beat.findFirst({
      where: { id: beatId, artistId: user.artist.id },
      include: { purchases: { where: { status: 'confirmed' } } },
    });
    if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });

    // Hard block: exclusively sold beats are permanently locked
    if (beat.isExclusive) {
      return NextResponse.json({
        error: 'This beat was sold exclusively. It is permanently locked and cannot be deleted or re-listed. The exclusive buyer owns full rights.',
      }, { status: 409 });
    }

    // Soft block: beats with any confirmed sale cannot be deleted (buyer still needs download)
    if (beat.purchases.length > 0) {
      return NextResponse.json({
        error: `This beat has ${beat.purchases.length} confirmed sale(s). You can hide it (set to Hidden) but cannot delete it while buyers may still need access.`,
      }, { status: 409 });
    }

    await prisma.beat.delete({ where: { id: beatId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DB error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
