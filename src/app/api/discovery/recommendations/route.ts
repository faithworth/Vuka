export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getRecommendedBeats, getRecommendedArtists } from '@/lib/discovery';

// GET /api/discovery/recommendations?type=beats|artists&limit=20
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const type = req.nextUrl.searchParams.get('type') ?? 'beats';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    if (type === 'artists') {
      const artists = await getRecommendedArtists(user.id, limit);
      return NextResponse.json({ artists });
    }

    const beats = await getRecommendedBeats(user.id, limit);
    return NextResponse.json({ beats });
  } catch (err) {
    console.error('[Recommendations] Error:', err);
    return NextResponse.json({ error: 'Failed to load recommendations' }, { status: 500 });
  }
}
