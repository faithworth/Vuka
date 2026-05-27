export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getPlatformAnalytics } from '@/lib/analytics';

// GET /api/analytics/platform  — admin only
export async function GET() {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await getPlatformAnalytics();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics/Platform] Error:', err);
    return NextResponse.json({ error: 'Failed to load platform analytics' }, { status: 500 });
  }
}
