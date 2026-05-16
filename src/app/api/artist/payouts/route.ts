import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase';

/**
 * GET /api/artist/payouts
 * Get artist payout history and balance
 */
export async function GET(req: NextRequest) {
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
      return NextResponse.json(
        { payouts: [], pending: 0, processed: 0, failed: 0, methods: [] },
        { status: 200 }
      );
    }

    // Get all payouts
    const allPayouts = await prisma.artistPayout.findMany({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Calculate balances by status
    const pending = allPayouts
      .filter((p: { status: string; netAmount: number }) => p.status === 'pending')
      .reduce((sum: number, p: { netAmount: number }) => sum + p.netAmount, 0);

    const processed = allPayouts
      .filter((p: { status: string; netAmount: number }) => p.status === 'completed')
      .reduce((sum: number, p: { netAmount: number }) => sum + p.netAmount, 0);

    const failed = allPayouts
      .filter((p: { status: string; netAmount: number }) => p.status === 'failed')
      .reduce((sum: number, p: { netAmount: number }) => sum + p.netAmount, 0);

    // Get available payout methods
    const methods = [];
    if (artist.payfastMerchant) {
      methods.push({
        type: 'payfast',
        name: 'PayFast (Direct to Bank)',
        configured: true,
        merchantId: artist.payfastMerchant.substring(0, 6) + '***',
      });
    }
    if (artist.stripeAccountId) {
      methods.push({
        type: 'stripe',
        name: 'Stripe Connect',
        configured: true,
        accountId: artist.stripeAccountId.substring(0, 6) + '***',
      });
    }
    if (methods.length === 0) {
      methods.push({
        type: 'payfast',
        name: 'PayFast (Direct to Bank)',
        configured: false,
      });
    }

    return NextResponse.json({
      payouts: allPayouts.map((p: any) => ({
        id: p.id,
        amount: p.amount,
        fee: p.fee,
        netAmount: p.netAmount,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
        processedAt: p.processedAt,
        payfastRef: p.payfastRef,
      })),
      balances: {
        pending,
        processed,
        failed,
        total: pending + processed,
      },
      methods,
      artistHasPayfastMerchant: !!artist.payfastMerchant,
      artistHasStripeConnect: !!artist.stripeAccountId,
    });
  } catch (err) {
    console.error('Payouts fetch error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
