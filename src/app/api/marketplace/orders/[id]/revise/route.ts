
// ============================================================
// PHASE 2 — src/app/api/marketplace/orders/[id]/revise/route.ts
// Buyer requests a revision on a delivered order
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requestRevision } from '@/lib/marketplace';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { notes } = await req.json();
    if (!notes?.trim()) return NextResponse.json({ error: 'Revision notes are required' }, { status: 400 });

    const order = await requestRevision(id, user.id);
    return NextResponse.json({ order });
  } catch (err: any) {
    console.error('[marketplace/orders/revise] POST error:', err?.message);
    const code = err?.message?.includes('Max revisions') ? 409
               : err?.message?.includes('not delivered') ? 409
               : 503;
    return NextResponse.json({ error: err?.message || 'Revision request failed' }, { status: code });
  }
}
