// ============================================================
// PHASE 2 — src/app/api/marketplace/orders/[id]/complete/route.ts
// Buyer marks order as complete — triggers seller payout
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { completeOrder } from '@/lib/marketplace';
import { createInvoiceFromOrder } from '@/lib/invoices';

type Params = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const order = await completeOrder(params.id, user.id);

    // Generate invoice for the completed order (non-blocking)
    createInvoiceFromOrder(order.id).catch(err =>
      console.error('[complete] invoice generation failed:', err?.message)
    );

    return NextResponse.json({
      order,
      message: 'Order completed. Payment released to seller.',
    });
  } catch (err: any) {
    console.error('[marketplace/orders/complete] POST error:', err?.message);
    const code = err?.message?.includes('must be delivered') ? 409
               : err?.message?.includes('Unauthorized') ? 403
               : 503;
    return NextResponse.json({ error: err?.message || 'Completion failed' }, { status: code });
  }
}
