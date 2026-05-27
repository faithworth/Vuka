export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getBrowseCategories, getBeatsByGenre } from '@/lib/discovery';

// GET /api/discovery/browse             → all genre categories
// GET /api/discovery/browse?genre=Trap  → beats in that genre
export async function GET(req: NextRequest) {
  try {
    const genre = req.nextUrl.searchParams.get('genre');

    if (!genre) {
      const categories = await getBrowseCategories();
      return NextResponse.json({ categories });
    }

    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);
    const sort = (req.nextUrl.searchParams.get('sort') ?? 'popular') as 'popular' | 'new' | 'price_asc' | 'price_desc';

    const result = await getBeatsByGenre(genre, page, limit, sort);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Browse] Error:', err);
    return NextResponse.json({ error: 'Failed to load browse data' }, { status: 500 });
  }
}
