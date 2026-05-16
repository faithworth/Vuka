import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase';
import crypto from 'crypto';

/**
 * POST /api/artist/payouts/payfast-initiate
 * Artist initiates PayFast payout - sends funds to their bank account via PayFast
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const artist = await prisma.artist.findUnique({
      where: { userId: user.id },
      include: { payouts: { where: { status: 'pending' } } },
    });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const body = await req.json();
    const { amount, bankAccountEndsWith4Digits, notes } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Get pending payouts totaling the requested amount
    const pendingPayouts = await prisma.artistPayout.findMany({
      where: {
        artistId: artist.id,
        status: 'pending',
        method: 'payfast',
      },
      take: 50,
    });

    let totalNetAmount = pendingPayouts.reduce((sum: number, p: { netAmount: number }) => sum + p.netAmount, 0);
    if (totalNetAmount < amount) {
      return NextResponse.json({
        error: `Only ${totalNetAmount.toFixed(2)} ZAR available in pending payouts`,
        available: totalNetAmount,
      }, { status: 400 });
    }

    // Mark selected payouts as processing
    const selectedPayouts: typeof pendingPayouts = [];
    let runningTotal = 0;
    for (const payout of pendingPayouts) {
      if (runningTotal >= amount) break;
      selectedPayouts.push(payout);
      runningTotal += payout.netAmount;
    }

    const payoutIds = selectedPayouts.map((p: { id: string }) => p.id);
    const totalToProcess = selectedPayouts.reduce((sum: number, p: { netAmount: number }) => sum + p.netAmount, 0);

    // Update payouts to processing
    await prisma.artistPayout.updateMany({
      where: { id: { in: payoutIds } },
      data: { status: 'processing' },
    });

    // Create settlement reference
    const settlementRef = `VUKA-${Date.now().toString(36).toUpperCase()}`;

    return NextResponse.json({
      success: true,
      settlementRef,
      totalAmount: totalToProcess,
      payoutCount: selectedPayouts.length,
      bankAccountLast4: bankAccountEndsWith4Digits,
      currency: 'ZAR',
      artistId: artist.id,
      artistName: artist.name,
      payoutIds,
      notes: `Settlement: ${settlementRef}. ${notes || ''}`,
    });
  } catch (err) {
    console.error('PayFast payout initiate error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
