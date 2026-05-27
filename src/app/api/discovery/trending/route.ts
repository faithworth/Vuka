export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getTrending } from '@/lib/discovery';

// GET /api/discovery/trending?period=daily&category=beats&limit=20
export async function GET(req: NextRequest) {
  try {
    const period = (req.nextUrl.searchParams.get('period') ?? 'daily') as 'hourly' | 'daily' | 'weekly';
    const category = (req.nextUrl.searchParams.get('category') ?? 'beats') as 'beats' | 'artists' | 'releases' | 'tags';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    if (!['hourly', 'daily', 'weekly'].includes(period)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }
    if (!['beats', 'artists', 'releases', 'tags'].includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const result = await getTrending(period, category, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Trending] Error:', err);
    return NextResponse.json({ error: 'Failed to load trending' }, { status: 500 });
  }
}
