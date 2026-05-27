// ============================================================
// PHASE 2 — src/app/api/marketplace/orders/[id]/deliver/route.ts
// Seller delivers an order — uploads deliverables
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { deliverOrder } from '@/lib/marketplace';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { deliverables, notes } = await req.json();
    if (!deliverables?.length) {
      return NextResponse.json({ error: 'At least one deliverable file required' }, { status: 400 });
    }

    const order = await deliverOrder(params.id, user.artist.id, deliverables, notes);
    return NextResponse.json({ order });
  } catch (err: any) {
    console.error('[marketplace/orders/deliver] POST error:', err?.message);
    const code = err?.message?.includes('Unauthorized') ? 403
               : err?.message?.includes('not found') ? 404
               : err?.message?.includes('cannot') ? 409
               : 503;
    return NextResponse.json({ error: err?.message || 'Delivery failed' }, { status: code });
  }
}
