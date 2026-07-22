
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { resolveAbuseReport } from '@/lib/moderation';

// PATCH /api/moderation/reports/[id] — admin resolves a report
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getServerUser();
    if (!user || !['owner','super_admin','admin','moderator'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { resolution, actionTaken, adminNotes } = await req.json();
    if (!resolution) return NextResponse.json({ error: 'resolution required' }, { status: 400 });

    const updated = await resolveAbuseReport(
      id,
      user.email,
      resolution,
      adminNotes ?? actionTaken
    );

    return NextResponse.json({ report: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to resolve report';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
