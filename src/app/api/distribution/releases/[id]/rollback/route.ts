// ============================================================
// PHASE 2 — src/app/api/distribution/releases/[id]/rollback/route.ts
// Artist-initiated takedown / rollback
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { rollbackDelivery } from '@/lib/distribution';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const release = await prisma.distributionRelease.findFirst({
      where: { id: params.id, artistId: user.artist.id },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    const rollbackable = ['delivering', 'live', 'submitted'];
    if (!rollbackable.includes(release.status)) {
      return NextResponse.json(
        { error: `Release cannot be rolled back from status "${release.status}"` },
        { status: 409 }
      );
    }

    await rollbackDelivery(params.id);

    return NextResponse.json({
      ok: true,
      status: 'takedown',
      message: 'Takedown initiated. DSP removal may take 24–72 hours depending on the platform.',
    });
  } catch (err: any) {
    console.error('[distribution/rollback] POST error:', err?.message);
    return NextResponse.json({ error: 'Rollback failed' }, { status: 503 });
  }
}
