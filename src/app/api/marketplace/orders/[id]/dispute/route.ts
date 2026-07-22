
// ============================================================
// PHASE 2 — src/app/api/marketplace/orders/[id]/dispute/route.ts
// Either party can raise a dispute on an active order
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { raiseDispute } from '@/lib/marketplace';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { reason, evidence } = await req.json();
    if (!reason?.trim()) return NextResponse.json({ error: 'Dispute reason required' }, { status: 400 });

    const dispute = await raiseDispute(id, user.id, reason);
    return NextResponse.json({
      dispute,
      message: 'Dispute raised. Our moderation team will review within 2–3 business days.',
    }, { status: 201 });
  } catch (err: any) {
    console.error('[marketplace/orders/dispute] POST error:', err?.message);
    const code = err?.message?.includes('Only order parties') ? 403
               : err?.message?.includes('not found') ? 404
               : 503;
    return NextResponse.json({ error: err?.message || 'Dispute failed' }, { status: code });
  }
}
