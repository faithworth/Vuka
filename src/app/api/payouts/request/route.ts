// ============================================================
// src/app/api/payouts/request/route.ts
// Artist requests a payout of their available balance
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { requestPayout, retryPayoutRequest } from '@/lib/payouts';
import prisma from '@/lib/prisma';

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

// POST — submit a new payout request
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { amount, currency, method, bankAccountId, bankAccountRef, bankName, accountHolder, paypalEmail } = body;

    if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    if (!method) return NextResponse.json({ error: 'Payout method required' }, { status: 400 });

    const validMethods = ['payfast', 'bank_transfer', 'paypal'];
    if (!validMethods.includes(method)) {
      return NextResponse.json({ error: `Invalid method. Supported: ${validMethods.join(', ')}` }, { status: 400 });
    }

    const request = await requestPayout({
      artistId: user.artist.id,
      amount: parseFloat(amount),
      currency: currency || 'ZAR',
      method,
      bankAccountId,
      bankAccountRef,
      bankName,
      accountHolder,
      paypalEmail,
    });

    return NextResponse.json({ request }, { status: 201 });
  } catch (err: any) {
    console.error('[payouts/request] POST error:', err?.message);
    const code = err?.message?.includes('exceeds available') ? 422 : 503;
    return NextResponse.json({ error: err?.message || 'Payout request failed' }, { status: code });
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
