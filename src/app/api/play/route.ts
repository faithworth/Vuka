// POST /api/play — record a play event (called when audio starts)
// FIX: now also increments the AnalyticsDailyRollup so that
//      /dashboard/analytics shows plays correctly.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { incrementDailyRollup } from '@/lib/social';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { itemId, itemType } = await req.json();
    if (!itemId || !itemType) return NextResponse.json({ ok: false });

    if (itemType === 'beat') {
      const beat = await prisma.beat.update({
        where: { id: itemId },
        data: {
          plays: { increment: 1 },
          artist: { update: { totalPlays: { increment: 1 } } },
        },
        select: { artistId: true },
      });

      // FIX: roll into the daily analytics rollup so the analytics dashboard
      // can read it. Without this, /dashboard/analytics always showed 0 plays.
      if (beat?.artistId) {
        await incrementDailyRollup(beat.artistId, 'beatPlays').catch(() => {});
      }

    } else if (itemType === 'release') {
      // A release can have many tracks — we need the artistId from the release
      const release = await prisma.release.update({
        where: { id: itemId },
        data: {
          plays: { increment: 1 },
          artist: { update: { totalPlays: { increment: 1 } } },
        },
        select: { artistId: true },
      });

      // FIX: same rollup for release plays
      if (release?.artistId) {
        await incrementDailyRollup(release.artistId, 'releasePlays').catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Play track error:', err);
    return NextResponse.json({ ok: false });
  }
}
