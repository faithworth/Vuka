export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getModerationDashboard } from '@/lib/moderation';

// GET /api/moderation/admin — full moderation dashboard overview
export async function GET() {
  try {
    const user = await getServerUser();
    if (!user || !['owner','super_admin','admin','moderator'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await getModerationDashboard();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Moderation/Admin] Error:', err);
    return NextResponse.json({ error: 'Failed to load moderation dashboard' }, { status: 500 });
  }
}
