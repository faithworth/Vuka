export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { recordPlay, recordPageView } from '@/lib/analytics';

// POST /api/analytics/plays
// Body: { artistId, itemType: 'beat'|'release'|'video', itemId, country? }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser().catch(() => null);
    const body = await req.json();
    const { artistId, itemType, itemId, country } = body;

    if (!artistId || !itemType || !itemId) {
      return NextResponse.json({ error: 'artistId, itemType, and itemId required' }, { status: 400 });
    }
    if (!['beat', 'release', 'video'].includes(itemType)) {
      return NextResponse.json({ error: 'Invalid itemType' }, { status: 400 });
    }

    await recordPlay({ artistId, itemType, itemId, country, userId: user?.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Plays] Error:', err);
    return NextResponse.json({ error: 'Failed to record play' }, { status: 500 });
  }
}

// POST /api/analytics/plays?action=pageview — page view tracking
export async function GET(req: NextRequest) {
  // Pixel-style tracking: /api/analytics/plays?type=view&target=beat&id=xxx&aid=yyy
  try {
    const targetType = req.nextUrl.searchParams.get('target') ?? '';
    const targetId = req.nextUrl.searchParams.get('id') ?? '';
    const artistId = req.nextUrl.searchParams.get('aid') ?? undefined;
    const country = req.nextUrl.searchParams.get('c') || req.headers.get('x-vercel-ip-country') || undefined;

    if (targetType && targetId) {
      await recordPageView({ artistId, targetType, targetId, country });
    }

    // Return 1x1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    return new NextResponse(gif, {
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
