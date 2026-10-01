// ============================================================
// src/app/api/payouts/request/route.ts (Phase 9)
// Artist requests a payout — now sends sendPayoutRequested email
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { requestPayout, retryPayoutRequest } from '@/lib/payouts';
import prisma from '@/lib/prisma';
import { schemas, validationError } from '@/lib/validation';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { sendPayoutRequested } from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

// GET — list artist's payout requests
export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requests = await prisma.payoutRequest.findMany({
      where: { artistId: user.artist.id },
      include: {
        bankAccount: {
          select: {
            bankName: true,
            accountHolder: true,
            maskedNumber: true,
            branchCode: true,
            accountType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[payouts/request] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — create a payout instruction for manual settlement.
// The artist chooses Bank Account or PayPal. Vuka does not automatically
// send money; the admin manually settles approved requests from the
// Yoco-funded company balance.
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const method = body.method === 'paypal' ? 'paypal' : 'bank_transfer';
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'A valid payout amount is required' }, { status: 400 });
    }

    let bankAccountId: string | undefined;
    let paypalEmail: string | undefined;
    if (method === 'paypal') {
      paypalEmail = String(body.paypalEmail || user.artist.paypalEmail || '').trim();
      if (!paypalEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(paypalEmail)) {
        return NextResponse.json({ error: 'A valid PayPal email is required' }, { status: 400 });
      }
    } else {
      bankAccountId = String(body.bankAccountId || '');
      const account = await prisma.artistBankAccount.findFirst({
        where: { id: bankAccountId, artistId: user.artist.id },
        select: { id: true, isVerified: true, eligibleForPayoutAt: true },
      });
      if (!account) return NextResponse.json({ error: 'Select a bank account' }, { status: 400 });
      if (!account.isVerified) return NextResponse.json({ error: 'Selected bank account is not verified yet' }, { status: 409 });
      if (account.eligibleForPayoutAt && account.eligibleForPayoutAt > new Date()) {
        return NextResponse.json({ error: 'Selected bank account is still in its security cooldown' }, { status: 409 });
      }
    }

    const availableRows = await prisma.artistPayout.findMany({
      where: { artistId: user.artist.id, status: 'pending', method: 'yoco' },
      select: { amount: true },
    });
    const available = availableRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (amount > available + 0.01) {
      return NextResponse.json({ error: `Requested amount exceeds your cleared Yoco-funded balance of R${available.toFixed(2)}.` }, { status: 409 });
    }

    const result = await requestPayout({
      artistId: user.artist.id,
      amount,
      currency: 'ZAR',
      method,
      bankAccountId,
      paypalEmail,
    });

    return NextResponse.json({ request: result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not create payout request' }, { status: 400 });
  }
}

// PATCH — retry a failed payout request
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

    // Verify ownership
    const existing = await prisma.payoutRequest.findFirst({
      where: { id: requestId, artistId: user.artist.id },
    });
    if (!existing) return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });

    const result = await retryPayoutRequest(requestId);
    return NextResponse.json({ result });
  } catch (err: any) {
    console.error('[payouts/request] PATCH error:', err?.message);
    const code = err?.message?.includes('Max retry') ? 409 : 503;
    return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: code });
  }
}


