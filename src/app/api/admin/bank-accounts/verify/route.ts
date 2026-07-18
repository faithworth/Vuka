export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

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

  const { bankAccountId, verified, method, notes } = await req.json();
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
