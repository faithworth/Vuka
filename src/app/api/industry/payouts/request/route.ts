// ============================================================
// src/app/api/industry/payouts/request/route.ts
// Mirrors src/app/api/payouts/request/route.ts (artist) for industry users.
// Industry user requests a payout — sends sendPayoutRequested email
// (shared template, generic "name" field works for both artists & industry).
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireIndustry } from '@/lib/auth';
import { requestIndustryPayout, retryIndustryPayoutRequest } from '@/lib/industry-payouts';
import prisma from '@/lib/prisma';
import { schemas, validationError } from '@/lib/validation';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { sendPayoutRequested } from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

// GET — list industry user's payout requests
export async function GET() {
  try {
    const user = await requireIndustry();
    if (!user?.industryUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requests = await prisma.industryPayoutRequest.findMany({
      where: { industryUserId: user.industryUser.id },
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
    console.error('[industry/payouts/request] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — create a payout instruction for manual settlement.
export async function POST(req: NextRequest) {
  try {
    const user = await requireIndustry();
    if (!user?.industryUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const method = body.method === 'paypal' ? 'paypal' : 'bank_transfer';
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'A valid payout amount is required' }, { status: 400 });
    }

    let bankAccountId: string | undefined;
    let paypalEmail: string | undefined;
    if (method === 'paypal') {
      paypalEmail = String(body.paypalEmail || '').trim();
      if (!paypalEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(paypalEmail)) {
        return NextResponse.json({ error: 'A valid PayPal email is required' }, { status: 400 });
      }
    } else {
      bankAccountId = String(body.bankAccountId || '');
      const account = await prisma.industryBankAccount.findFirst({
        where: { id: bankAccountId, industryUserId: user.industryUser.id },
        select: { id: true, isVerified: true, eligibleForPayoutAt: true },
      });
      if (!account) return NextResponse.json({ error: 'Select a bank account' }, { status: 400 });
      if (!account.isVerified) return NextResponse.json({ error: 'Selected bank account is not verified yet' }, { status: 409 });
      if (account.eligibleForPayoutAt && account.eligibleForPayoutAt > new Date()) {
        return NextResponse.json({ error: 'Selected bank account is still in its security cooldown' }, { status: 409 });
      }
    }

    const result = await requestIndustryPayout({
      industryUserId: user.industryUser.id,
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

// PATCH — retry a rejected payout request
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireIndustry();
    if (!user?.industryUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

    // Verify ownership
    const existing = await prisma.industryPayoutRequest.findFirst({
      where: { id: requestId, industryUserId: user.industryUser.id },
    });
    if (!existing) return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });

    const result = await retryIndustryPayoutRequest(requestId);
    return NextResponse.json({ result });
  } catch (err: any) {
    console.error('[industry/payouts/request] PATCH error:', err?.message);
    const code = err?.message?.includes('Only rejected') ? 409 : 503;
    return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: code });
  }
}
