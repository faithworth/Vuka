export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { decrypt } from '@/lib/encryption';
import { createTransferRecipient, getBankCode } from '@/lib/paystack';

// POST /api/admin/bank-accounts/verify
// Body: { bankAccountId: string, verified: boolean, method?: string, notes?: string }
//
// This is the missing counterpart to the isVerified/eligibleForPayoutAt
// fields on ArtistBankAccount — before this endpoint existed, nothing
// could ever set isVerified to true, so no bank account could ever pass
// the payout enforcement check in /api/admin/payouts.

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Backfill missing Paystack recipient codes ────────────────────────────
  // POST { action: 'backfill_recipients' } — creates Paystack transfer
  // recipients for all bank accounts that have no paystackAccountCode yet.
  const body = await req.json().catch(() => ({}));
  if ((body as any).action === 'backfill_recipients') {
    const accounts = await prisma.artistBankAccount.findMany({
      where: { OR: [{ paystackAccountCode: '' }, { paystackAccountCode: null }] },
      select: { id: true, accountHolder: true, bankName: true, branchCode: true, accountNumber: true },
    });

    const results: { id: string; status: string; code?: string }[] = [];
    for (const acc of accounts) {
      const bankCode = acc.branchCode || getBankCode(acc.bankName) || '';
      if (!bankCode) { results.push({ id: acc.id, status: 'skipped_no_bank_code' }); continue; }
      try {
        const plain = decrypt(acc.accountNumber); // decrypt stored number
        const code = await createTransferRecipient({ name: acc.accountHolder, accountNumber: plain, bankCode });
        if (code) {
          await prisma.artistBankAccount.update({
            where: { id: acc.id },
            data: { paystackAccountCode: code, isVerified: true },
          });
          results.push({ id: acc.id, status: 'created', code });
        } else {
          results.push({ id: acc.id, status: 'paystack_returned_null' });
        }
      } catch (e: any) {
        results.push({ id: acc.id, status: `error: ${e.message}` });
      }
    }
    return NextResponse.json({ ok: true, results });
  }

  const { bankAccountId, verified, method, notes } = body;
  if (!bankAccountId || typeof verified !== 'boolean') {
    return NextResponse.json(
      { error: 'bankAccountId and verified (boolean) required' },
      { status: 400 }
    );
  }

  const account = await prisma.artistBankAccount.findUnique({ where: { id: bankAccountId } });
  if (!account) {
    return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
  }

  const updated = await prisma.artistBankAccount.update({
    where: { id: bankAccountId },
    data: {
      isVerified: verified,
      verifiedAt: verified ? new Date() : null,
      verificationMethod: verified ? (method || 'manual_admin_review') : null,
    },
  });

  await auditLog.adminAction(
    'payment.bank_account_verified',
    'ArtistBankAccount',
    bankAccountId,
    admin.id,
    `verified=${verified} method=${method || 'manual_admin_review'} ${notes || ''}`
  );

  return NextResponse.json({
    ok: true,
    account: { id: updated.id, isVerified: updated.isVerified, verifiedAt: updated.verifiedAt },
  });
}
