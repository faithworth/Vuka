// POST /api/play — record a play event (called when audio starts)
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { incrementDailyRollup } from '@/lib/social';
import { upsertGeographyEvent } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { itemId, itemType } = await req.json();
    if (!itemId || !itemType) return NextResponse.json({ ok: false });

    // Vercel injects ISO 3166-1 alpha-2 country code at the edge — free,
    // no external API needed. Falls back to empty string if not present
    // (e.g. local dev or non-Vercel deployments).
    const country = req.headers.get('x-vercel-ip-country') || '';

    let artistId: string | null = null;

    if (itemType === 'beat') {
      const beat = await prisma.beat.update({
        where: { id: itemId },
        data: {
          plays: { increment: 1 },
          artist: { update: { totalPlays: { increment: 1 } } },
        },
        select: { artistId: true },
      });
      artistId = beat?.artistId ?? null;
      if (artistId) await incrementDailyRollup(artistId, 'beatPlays').catch(() => {});

    } else if (itemType === 'release') {
      const release = await prisma.release.update({
        where: { id: itemId },
        data: {
          plays: { increment: 1 },
          artist: { update: { totalPlays: { increment: 1 } } },
        },
        select: { artistId: true },
      });
      artistId = release?.artistId ?? null;
      if (artistId) await incrementDailyRollup(artistId, 'releasePlays').catch(() => {});

    } else if (itemType === 'video') {
      const video = await prisma.video.update({
        where: { id: itemId },
        data: {
          views: { increment: 1 },
          artist: { update: { totalPlays: { increment: 1 } } },
        },
        select: { artistId: true },
      });
      artistId = video?.artistId ?? null;
      if (artistId) await incrementDailyRollup(artistId, 'videoPlays').catch(() => {});
    }

    // Geography — fires for all content types whenever country is known
    if (artistId && country) {
      upsertGeographyEvent(artistId, country, 'play').catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Play track error:', err);
    return NextResponse.json({ ok: false });
  }
}
