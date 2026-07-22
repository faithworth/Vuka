
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { incrementReelView, deleteReel } from '@/lib/reels';

// GET /api/social/reels/[id] — single reel (permalink / deep link)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reel = await prisma.reel.findUnique({
      where: { id },
      include: { artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true } } },
    });
    if (!reel || !reel.isPublished) return NextResponse.json({ error: 'Reel not found' }, { status: 404 });
    return NextResponse.json({ reel });
  } catch (err) {
    console.error('[Reel/id] GET error:', err);
    return NextResponse.json({ error: 'Failed to load reel' }, { status: 500 });
  }
}

// POST /api/social/reels/[id] — increment view count (fired once per play)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await incrementReelView(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Reel/id] POST error:', err);
    return NextResponse.json({ error: 'Failed to record view' }, { status: 500 });
  }
}

// DELETE /api/social/reels/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await deleteReel(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete reel';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
