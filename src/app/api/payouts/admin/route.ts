// ============================================================
// PHASE 2 — src/app/api/payouts/admin/route.ts
// Admin: list pending payout requests, approve/reject
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { approvePayoutRequest, markPayoutPaid, rejectPayoutRequest } from '@/lib/payouts';

// GET — list payout requests for admin review
export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';

    const requests = await prisma.payoutRequest.findMany({
      where: status === 'all' ? {} : { status },
      include: {
        artist: { select: { id: true, name: true, slug: true, user: { select: { email: true } } } },
        bankAccount: { select: { bankName: true, accountHolder: true, maskedNumber: true, branchCode: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[payouts/admin] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — approve or reject a payout request
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { requestId, action, notes } = await req.json();
    if (!requestId || !action) {
      return NextResponse.json({ error: 'requestId and action required' }, { status: 400 });
    }

    switch (action) {
      case 'approve': {
        const result = await approvePayoutRequest(requestId, notes);
        return NextResponse.json({ ok: true, result });
      }

      case 'mark_paid': {
        const { reference } = await req.json().catch(() => ({ reference: undefined })) || {};
        const ref = reference || `manual-${Date.now()}`;
        const result = await markPayoutPaid(requestId, ref);
        return NextResponse.json({ ok: true, result });
      }

      case 'reject': {
        const existing = await prisma.payoutRequest.findUnique({ where: { id: requestId } });
        if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        if (existing.status !== 'pending' && existing.status !== 'approved') {
          return NextResponse.json({ error: `Request is ${existing.status}` }, { status: 409 });
        }
        const result = await rejectPayoutRequest(requestId, notes || 'Rejected by admin');
        return NextResponse.json({ ok: true, result });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[payouts/admin] POST error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Action failed' }, { status: 503 });
  }
}
