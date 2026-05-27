export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { discoverArtists } from '@/lib/discovery';

// GET /api/discovery/artists?genre=Amapiano&country=ZA&sort=popular&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const genre = req.nextUrl.searchParams.get('genre') ?? undefined;
    const country = req.nextUrl.searchParams.get('country') ?? undefined;
    const sort = (req.nextUrl.searchParams.get('sort') ?? 'popular') as 'popular' | 'new' | 'followers';
    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    const result = await discoverArtists(genre, country, sort, page, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Artists] Error:', err);
    return NextResponse.json({ error: 'Failed to load artists' }, { status: 500 });
  }
}
