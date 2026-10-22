export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

// POST /api/admin/bank-accounts/verify
// Supports both artist and industry bank accounts. Creating a Paystack recipient
// is not proof of ownership; verification remains an explicit admin decision.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { bankAccountId, industryBankAccountId, verified, method, notes } = body;
    const id = industryBankAccountId || bankAccountId;
    const isIndustry = Boolean(industryBankAccountId);
    if (!id || typeof verified !== 'boolean') {
      return NextResponse.json(
        { error: 'bankAccountId or industryBankAccountId and verified (boolean) required' },
        { status: 400 }
      );
    }

    if (isIndustry) {
      const account = await prisma.industryBankAccount.findUnique({ where: { id } });
      if (!account) return NextResponse.json({ error: 'Industry bank account not found' }, { status: 404 });
      const updated = await prisma.industryBankAccount.update({
        where: { id },
        data: { isVerified: verified },
        select: { id: true, isVerified: true, eligibleForPayoutAt: true },
      });
      await auditLog.adminAction(
        'payment.industry_bank_account_verified',
        'IndustryBankAccount',
        id,
        admin.id,
        `verified=${verified} method=${method || 'manual_admin_review'} ${notes || ''}`
      );
      return NextResponse.json({ ok: true, account: updated });
    }

    const account = await prisma.artistBankAccount.findUnique({ where: { id } });
    if (!account) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    const updated = await prisma.artistBankAccount.update({
      where: { id },
      data: {
        isVerified: verified,
        verifiedAt: verified ? new Date() : null,
        verificationMethod: verified ? (method || 'manual_admin_review') : null,
      },
    });
    await auditLog.adminAction(
      'payment.bank_account_verified',
      'ArtistBankAccount',
      id,
      admin.id,
      `verified=${verified} method=${method || 'manual_admin_review'} ${notes || ''}`
    );
    return NextResponse.json({
      ok: true,
      account: { id: updated.id, isVerified: updated.isVerified, verifiedAt: updated.verifiedAt },
    });
  } catch (err) {
    console.error('[admin/bank-accounts/verify] error:', err);
    return NextResponse.json({ error: 'Bank account verification failed' }, { status: 500 });
  }
}
