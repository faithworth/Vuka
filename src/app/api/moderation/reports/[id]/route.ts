export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { resolveAbuseReport } from '@/lib/moderation';

// PATCH /api/moderation/reports/[id] — admin resolves a report
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { resolution, actionTaken, adminNotes } = await req.json();
    if (!resolution) return NextResponse.json({ error: 'resolution required' }, { status: 400 });

    const updated = await resolveAbuseReport(
      params.id,
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
