export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { createTransferRecipient, getBankCode } from '@/lib/paystack';
import { dispatchPayout } from '@/lib/earnings';

/**
 * GET /api/admin/bank-accounts/backfill?secret=CRON_SECRET
 *
 * Safe to open directly in a phone browser.
 * 1. Registers Paystack transfer recipients for every bank account
 *    that currently has no paystackAccountCode.
 * 2. Dispatches every PayoutRequest that is stuck in 'approved' status
 *    (approved but never dispatched to Paystack).
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── Step 1: Register missing Paystack recipients ──────────────
  const accounts = await prisma.artistBankAccount.findMany({
    where: { OR: [{ paystackAccountCode: '' }, { paystackAccountCode: null }] },
    select: { id: true, accountHolder: true, bankName: true, branchCode: true, accountNumber: true },
  });

  const recipientResults: { id: string; status: string; code?: string }[] = [];

  for (const acc of accounts) {
    const bankCode = acc.branchCode || getBankCode(acc.bankName) || '';
    if (!bankCode) {
      recipientResults.push({ id: acc.id, status: 'skipped — no bank code' });
      continue;
    }
    try {
      const plain = decrypt(acc.accountNumber);
      const code = await createTransferRecipient({
        name: acc.accountHolder,
        accountNumber: plain,
        bankCode,
      });
      if (code) {
        await prisma.artistBankAccount.update({
          where: { id: acc.id },
          data: { paystackAccountCode: code, isVerified: true },
        });
        recipientResults.push({ id: acc.id, status: 'registered', code });
      } else {
        recipientResults.push({ id: acc.id, status: 'paystack returned null — check account details' });
      }
    } catch (e: any) {
      recipientResults.push({ id: acc.id, status: `error: ${e.message}` });
    }
  }

  results.recipients = recipientResults;

  // ── Step 2: Dispatch all stuck approved PayoutRequests ────────
  const stuckPayouts = await prisma.payoutRequest.findMany({
    where: { status: 'approved', processedAt: null },
    select: { id: true, amount: true, currency: true },
  });

  const dispatchResults: { id: string; amount: number; status: string; ref?: string }[] = [];

  for (const payout of stuckPayouts) {
    try {
      const result = await dispatchPayout(payout.id);
      dispatchResults.push({
        id: payout.id,
        amount: payout.amount,
        status: result.success ? 'dispatched' : `failed — ${result.error}`,
        ref: result.referenceId,
      });
    } catch (e: any) {
      dispatchResults.push({ id: payout.id, amount: payout.amount, status: `error: ${e.message}` });
    }
  }

  results.dispatched = dispatchResults;
  results.summary = {
    recipientsRegistered: recipientResults.filter(r => r.status === 'registered').length,
    payoutsDispatched: dispatchResults.filter(r => r.status === 'dispatched').length,
  };

  return NextResponse.json({ ok: true, results });
}
