/**
 * POST /api/admin/reconcile-support
 *
 * One-off cleanup for SupportTxn rows that got stuck 'pending' before the
 * SUP_ dispatch fix landed in /api/checkout/paystack/webhook. Paystack
 * already took these payments — the app just never heard back, because
 * charge.success events for SUP_ references were silently dropped. Their
 * webhook retry window has likely expired, so they won't self-heal.
 *
 * For each pending SupportTxn with a stored paystackReference, this
 * verifies the transaction directly against Paystack and, if it actually
 * succeeded, runs it through the exact same confirmation logic new tips
 * use (handleSupportEvent) — so fee calc, payout creation, goal totals,
 * and emails all happen exactly as they would have at the time.
 *
 * Safe to call more than once — handleSupportEvent no-ops on non-pending
 * SupportTxn rows.
 *
 * DELETE THIS ROUTE once you've run it and confirmed the dashboard looks
 * right — it's a migration tool, not a permanent feature.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { handleSupportEvent } from '@/lib/webhooks/paystack-handlers';
import { logger } from '@/lib/logger';

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pending = await prisma.supportTxn.findMany({
    where: { status: 'pending', paystackReference: { not: null } },
    select: { id: true, paystackReference: true, amount: true, fanName: true, artistId: true },
  });

  const results: Array<{ id: string; reference: string | null; outcome: string }> = [];

  for (const txn of pending) {
    if (!txn.paystackReference) continue;
    try {
      await handleSupportEvent(
        { event: 'charge.success', data: { reference: txn.paystackReference } },
        'admin-reconcile',
      );
      const fresh = await prisma.supportTxn.findUnique({ where: { id: txn.id }, select: { status: true } });
      results.push({ id: txn.id, reference: txn.paystackReference, outcome: fresh?.status ?? 'unknown' });
    } catch (err) {
      logger.error('[admin/reconcile-support] Failed', { txnId: txn.id, error: err instanceof Error ? err.message : String(err) });
      results.push({ id: txn.id, reference: txn.paystackReference, outcome: 'error' });
    }
  }

  return NextResponse.json({
    checked: pending.length,
    confirmed: results.filter(r => r.outcome === 'confirmed').length,
    stillPending: results.filter(r => r.outcome === 'pending').length,
    results,
  });
}
