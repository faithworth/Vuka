export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { search, autocomplete } from '@/lib/discovery';

// GET /api/discovery/search?q=amapiano&type=beat&genre=Amapiano&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q') ?? '';
    const mode = req.nextUrl.searchParams.get('mode'); // 'autocomplete' | undefined
    const entityType = req.nextUrl.searchParams.get('type') ?? undefined;
    const genre = req.nextUrl.searchParams.get('genre') ?? undefined;
    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    if (mode === 'autocomplete') {
      const result = await autocomplete(q);
      return NextResponse.json(result);
    }

    const result = await search(q, entityType, genre, page, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Search] Error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
