/**
 * POST /api/admin/reconcile-tickets
 *
 * ONE-OFF MIGRATION TOOL — delete this file after running it once.
 *
 * Fixes ticket purchases stuck in 'pending' because of the TICKET_/ticket_
 * webhook dispatch bug: Paystack already took the money (charge.success),
 * but the webhook silently no-opped, so the row never got confirmed, the
 * fan never got their QR-code email, and EventTicket.sold never
 * incremented.
 *
 * This groups all pending, paid rows by their shared paystackReference
 * (a group purchase creates one row per ticket, all sharing one charge)
 * and re-runs each group through the exact same handleTicketEvent logic
 * the webhook should have used the first time — re-verifying against
 * Paystack directly, never trusting the stale DB row alone.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { handleTicketEvent } from '@/lib/webhooks/paystack-handlers';

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pending = await prisma.ticketPurchase.findMany({
    where: { status: 'pending', paystackReference: { not: null } },
    select: { paystackReference: true },
  });

  const references = [...new Set(pending.map(p => p.paystackReference!).filter(Boolean))];

  const results: { reference: string; status: 'confirmed' | 'still_pending' | 'error'; error?: string }[] = [];

  for (const reference of references) {
    try {
      const before = await prisma.ticketPurchase.count({ where: { paystackReference: reference, status: 'pending' } });
      await handleTicketEvent({ data: { reference } } as any, 'reconcile-tickets');
      const after = await prisma.ticketPurchase.count({ where: { paystackReference: reference, status: 'pending' } });
      results.push({ reference, status: after < before ? 'confirmed' : 'still_pending' });
    } catch (err) {
      results.push({ reference, status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    checked: references.length,
    confirmed: results.filter(r => r.status === 'confirmed').length,
    stillPending: results.filter(r => r.status === 'still_pending').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  });
}
