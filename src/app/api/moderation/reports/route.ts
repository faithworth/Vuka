export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { submitAbuseReport } from '@/lib/moderation';

// POST /api/moderation/reports — submit abuse report (auth optional for anonymous reports)
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser().catch(() => null);
    const body = await req.json();

    const {
      targetType, targetId, targetTitle,
      reason, category, description, evidence,
      reporterEmail,
    } = body;

    if (!targetType || !targetId || !reason || !category) {
      return NextResponse.json(
        { error: 'targetType, targetId, reason, and category are required' },
        { status: 400 }
      );
    }

    const report = await submitAbuseReport({
      reporterUserId: user?.id,
      reporterEmail: reporterEmail ?? user?.email ?? '',
      targetType,
      targetId,
      targetTitle,
      reason,
      category,
      description,
      evidence,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit report';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
