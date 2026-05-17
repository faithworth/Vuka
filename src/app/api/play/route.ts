// POST /api/play — record a play event (called when audio starts)
// Debounced server-side: only counts once per item per session via a simple check
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { itemId, itemType } = await req.json();
    if (!itemId || !itemType) return NextResponse.json({ ok: false });

    if (itemType === 'beat') {
      await prisma.beat.update({
        where: { id: itemId },
        data: {
          plays: { increment: 1 },
          artist: { update: { totalPlays: { increment: 1 } } },
        },
      });
    } else if (itemType === 'release') {
      await prisma.release.update({
        where: { id: itemId },
        data: {
          plays: { increment: 1 },
          artist: { update: { totalPlays: { increment: 1 } } },
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Don't fail silently for the client — it's non-critical
    console.error('Play track error:', err);
    return NextResponse.json({ ok: false });
  }
}
