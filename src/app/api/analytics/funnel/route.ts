export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getConversionFunnel, getTopArtistsByPlays } from '@/lib/analytics';

// GET /api/analytics/funnel  — admin only
export async function GET() {
  try {
    const user = await getServerUser();
    if (!user || !['owner', 'super_admin', 'admin', 'moderator'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [funnel, topArtists] = await Promise.all([
      getConversionFunnel(),
      getTopArtistsByPlays(20),
    ]);

    return NextResponse.json({ funnel, topArtists });
  } catch (err) {
    console.error('[Analytics/Funnel] Error:', err);
    return NextResponse.json({ error: 'Failed to load funnel data' }, { status: 500 });
  }
}
