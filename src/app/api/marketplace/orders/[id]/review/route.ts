
// ============================================================
// PHASE 2 — src/app/api/marketplace/orders/[id]/review/route.ts
// Buyer submits a review for a completed order
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { submitReview } from '@/lib/marketplace';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { rating, comment } = await req.json();
    if (!rating) return NextResponse.json({ error: 'Rating required (1–5)' }, { status: 400 });

    const review = await submitReview(id, user.id, parseInt(rating), comment);
    return NextResponse.json({ review }, { status: 201 });
  } catch (err: any) {
    console.error('[marketplace/orders/review] POST error:', err?.message);
    const code = err?.message?.includes('1-5') ? 400
               : err?.message?.includes('Only the buyer') ? 403
               : err?.message?.includes('completed') ? 409
               : 503;
    return NextResponse.json({ error: err?.message || 'Review failed' }, { status: code });
  }
}
