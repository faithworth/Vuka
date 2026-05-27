// ============================================================
// PHASE 2 — src/app/api/payouts/reconciliation/route.ts
// Artist payout reconciliation: balance summary + history
// ============================================================

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPayoutReconciliation } from '@/lib/payouts';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const report = await getPayoutReconciliation(user.artist.id);
    return NextResponse.json({ report });
  } catch (err) {
    console.error('[payouts/reconciliation] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
