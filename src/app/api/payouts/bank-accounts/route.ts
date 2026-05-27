// ============================================================
// PHASE 2 — src/app/api/payouts/bank-accounts/route.ts
// Artist bank account / payout destination management
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { addBankAccount } from '@/lib/payouts';

// GET — list artist's payment destinations
export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accounts = await prisma.artistBankAccount.findMany({
      where: { artistId: user.artist.id },
      select: {
        id: true,
        accountType: true,
        bankName: true,
        accountHolder: true,
        // Mask account number for security
        accountNumber: false,
        // Return last 4 only
        branchCode: true,
        paypalEmail: true,
        payfastMerchantId: true,
        isDefault: true,
        isVerified: true,
        createdAt: true,
      },
    });

    // Manually mask account numbers before sending
    const safe = await prisma.artistBankAccount.findMany({
      where: { artistId: user.artist.id },
    });

    return NextResponse.json({
      accounts: safe.map(a => ({
        ...a,
        accountNumber: a.accountNumber ? `****${a.accountNumber.slice(-4)}` : '',
      })),
    });
  } catch (err) {
    console.error('[payouts/bank-accounts] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — add a new bank account / payout destination
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { accountType, bankName, branchCode, accountNumber, accountHolder, accountType2, paypalEmail, payfastMerchantId, isDefault } = body;

    if (!accountType) return NextResponse.json({ error: 'accountType required' }, { status: 400 });

    if (accountType === 'bank') {
      if (!bankName || !accountNumber || !accountHolder) {
        return NextResponse.json({ error: 'Bank accounts require bankName, accountNumber, and accountHolder' }, { status: 400 });
      }
    }
    if (accountType === 'paypal' && !paypalEmail) {
      return NextResponse.json({ error: 'paypalEmail required for PayPal accounts' }, { status: 400 });
    }

    const account = await addBankAccount(user.artist.id, {
      accountType,
      bankName,
      branchCode,
      accountNumber,
      accountHolder,
      accountType2,
      paypalEmail,
      payfastMerchantId,
      isDefault,
    });

    return NextResponse.json({
      account: { ...account, accountNumber: account.accountNumber ? `****${account.accountNumber.slice(-4)}` : '' },
    }, { status: 201 });
  } catch (err: any) {
    console.error('[payouts/bank-accounts] POST error:', err?.message);
    return NextResponse.json({ error: 'Failed to add account' }, { status: 503 });
  }
}

// DELETE — remove a bank account
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

    const account = await prisma.artistBankAccount.findFirst({
      where: { id: accountId, artistId: user.artist.id },
    });
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    await prisma.artistBankAccount.delete({ where: { id: accountId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[payouts/bank-accounts] DELETE error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 503 });
  }
}
