// ============================================================
// PHASE 2 — src/app/api/creator/analytics/route.ts
// Artist creator analytics: revenue, memberships, sales breakdown
// ============================================================

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getCreatorAnalytics } from '@/lib/creator';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const analytics = await getCreatorAnalytics(user.artist.id);
    return NextResponse.json({ analytics });
  } catch (err) {
    console.error('[creator/analytics] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
