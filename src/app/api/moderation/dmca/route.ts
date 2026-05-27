export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { processDMCAReport } from '@/lib/moderation';

// PATCH /api/moderation/dmca — admin processes a DMCA report
// Body: { reportId, action, adminNotes? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { reportId, action, adminNotes } = await req.json();
    if (!reportId || !action) {
      return NextResponse.json({ error: 'reportId and action required' }, { status: 400 });
    }

    const result = await processDMCAReport(reportId, user.email, action, adminNotes);
    return NextResponse.json({ report: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process DMCA report';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
