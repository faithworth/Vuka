// src/app/api/admin/earnings/route.ts
// Phase 7 — Admin: revenue records, payout requests, and manual credits.
//
// GET  ?action=list                       — list all RevenueRecords (paginated)
// GET  ?action=payouts                    — list PayoutRequests

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { dispatchPayout } from '@/lib/earnings';

// GET — list revenue records or pending payouts
export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const skip = (page - 1) * limit;

    if (action === 'list') {
      const [records, total] = await Promise.all([
        prisma.revenueRecord.findMany({
          include: { artist: { select: { name: true, slug: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.revenueRecord.count(),
      ]);

      // Aggregate totals
      const totals = await prisma.revenueRecord.aggregate({
        _sum: { amount: true, netAmount: true, platformFee: true },
      });

      return NextResponse.json({ records, total, page, limit, totals: totals._sum });
    }

    if (action === 'payouts') {
      const status = searchParams.get('status') || 'pending';
      const [requests, counts] = await Promise.all([
        prisma.payoutRequest.findMany({
          where: status === 'all' ? {} : { status },
          include: {
            artist: { select: { name: true, slug: true, user: { select: { email: true } } } },
            bankAccount: {
              select: { bankName: true, accountHolder: true, maskedNumber: true, branchCode: true, accountType: true },
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
        prisma.payoutRequest.groupBy({
          by: ['status'],
          _count: true,
          _sum: { amount: true },
        }),
      ]);

      return NextResponse.json({ requests, counts });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/earnings] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — preview or confirm earnings ingestion, or dispatch a payout
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── Approve Payout ────────────────────────────────────────
    if (action === 'approve_payout') {
      const { payoutRequestId, notes } = body;
      if (!payoutRequestId) return NextResponse.json({ error: 'payoutRequestId required' }, { status: 400 });
      await prisma.payoutRequest.update({
        where: { id: payoutRequestId },
        data: { status: 'approved', adminNotes: notes || '' },
      });
      return NextResponse.json({ ok: true });
    }

    // ── Reject Payout ─────────────────────────────────────────
    if (action === 'reject_payout') {
      const { payoutRequestId, notes } = body;
      if (!payoutRequestId) return NextResponse.json({ error: 'payoutRequestId required' }, { status: 400 });
      await prisma.payoutRequest.update({
        where: { id: payoutRequestId },
        data: { status: 'rejected', adminNotes: notes || 'Rejected by admin' },
      });
      return NextResponse.json({ ok: true });
    }

    // ── Dispatch Payout ───────────────────────────────────────
    if (action === 'dispatch_payout') {
      const { payoutRequestId } = body;
      if (!payoutRequestId) {
        return NextResponse.json({ error: 'payoutRequestId required' }, { status: 400 });
      }

      const result = await dispatchPayout(payoutRequestId);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }

      return NextResponse.json({ ok: true, referenceId: result.referenceId });
    }

    // ── Manual Balance Adjustment ─────────────────────────────
    if (action === 'manual_credit') {
      const { artistId, amount, currency, period, notes } = body;

      if (!artistId || !amount) {
        return NextResponse.json({ error: 'artistId and amount required' }, { status: 400 });
      }

      const artist = await prisma.artist.findUnique({ where: { id: artistId } });
      if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

      const vukaFee = parseFloat(((amount * 0) / 100).toFixed(2)); // 0% fee on manual credits
      const net = parseFloat((amount - vukaFee).toFixed(2));

      const record = await prisma.revenueRecord.create({
        data: {
          artistId,
          type: 'distribution',
          amount: parseFloat(amount),
          platformFee: vukaFee,
          netAmount: net,
          currency: currency || 'ZAR',
          period: period || new Date().toISOString().slice(0, 7),
        },
      });

      // Audit log
      await prisma.adminLog?.create?.({
        data: {
          actorId:    user.id,
          action:     'manual_credit',
          targetType: 'artist',
          targetId:   artistId,
          notes:      `amount=${amount} currency=${currency} period=${period} record=${record.id}${notes ? ' notes=' + notes : ''}`,
        },
      }).catch(() => null); // Non-blocking

      return NextResponse.json({ ok: true, record });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error('[admin/earnings] POST error:', err);
    const msg = err instanceof Error ? err.message : 'Action failed';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
