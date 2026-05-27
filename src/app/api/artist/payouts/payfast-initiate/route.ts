import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase';

/**
 * POST /api/artist/payouts/payfast-initiate
 * Artist initiates a payout request against their confirmed sales balance.
 * ArtistPayout rows don't carry netAmount — we derive available balance
 * from confirmed Purchase rows where netAmount > 0.
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
    });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const body = await req.json();
    const { amount, bankAccountEndsWith4Digits, notes } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Derive available balance from confirmed purchases net amounts
    const confirmedPurchases = await prisma.purchase.findMany({
      where: {
        status: 'confirmed',
        beat:    { artistId: artist.id },
      },
      select: { netAmount: true },
    });

    // Also check releases, videos, samples
    const [releasePurchases, videoPurchases, samplePurchases] = await Promise.all([
      prisma.purchase.findMany({ where: { status: 'confirmed', release: { artistId: artist.id } }, select: { netAmount: true } }),
      prisma.purchase.findMany({ where: { status: 'confirmed', video:   { artistId: artist.id } }, select: { netAmount: true } }),
      prisma.purchase.findMany({ where: { status: 'confirmed', sample:  { artistId: artist.id } }, select: { netAmount: true } }),
    ]);

    const allPurchases = [...confirmedPurchases, ...releasePurchases, ...videoPurchases, ...samplePurchases];
    const totalAvailable = allPurchases.reduce((sum: number, p: { netAmount: number }) => sum + p.netAmount, 0);

    // Check already-requested payout amounts
    const existingRequests = await prisma.payoutRequest.aggregate({
      where: { artistId: artist.id, status: { in: ['pending', 'approved'] } },
      _sum: { amount: true },
    });
    const alreadyRequested = existingRequests._sum.amount ?? 0;
    const actuallyAvailable = totalAvailable - alreadyRequested;

    if (actuallyAvailable < amount) {
      return NextResponse.json({
        error: `Only ${actuallyAvailable.toFixed(2)} ZAR available`,
        available: actuallyAvailable,
      }, { status: 400 });
    }

    // Create a payout request (manual processing — truthful status)
    const settlementRef = `VUKA-${Date.now().toString(36).toUpperCase()}`;

    const payoutRequest = await prisma.payoutRequest.create({
      data: {
        artistId: artist.id,
        amount,
        currency: 'ZAR',
        status: 'pending',
        adminNotes: `PayFast request. Ref: ${settlementRef}. Last4: ${bankAccountEndsWith4Digits ?? 'N/A'}. ${notes ?? ''}`.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      settlementRef,
      payoutRequestId: payoutRequest.id,
      requestedAmount: amount,
      currency: 'ZAR',
      status: 'pending',
      message: 'Payout request submitted. Processing within 2–5 business days.',
    });
  } catch (err) {
    console.error('PayFast payout initiate error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
