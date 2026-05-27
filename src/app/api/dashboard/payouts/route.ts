// src/app/api/dashboard/payouts/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Always re-fetch from DB — session cache can be stale
    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { id: true, stripeAccountId: true, payfastMerchant: true, currency: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    // Get all payout records for this artist
    const payouts = await prisma.artistPayout.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Totals
    const totalEarned = payouts.reduce((sum: number, p: any) => sum + p.netAmount, 0);
    const totalPaid = payouts.filter((p: any) => p.status === 'completed').reduce((sum: number, p: any) => sum + p.netAmount, 0);
    const totalPending = payouts.filter((p: any) => p.status === 'pending').reduce((sum: number, p: any) => sum + p.netAmount, 0);

    // Stripe balance if connected
    let stripeBalance = null;
    let stripePayouts: any[] = [];
    if (artist.stripeAccountId) {
      try {
        const [bal, sp] = await Promise.all([
          stripe.balance.retrieve({ stripeAccount: artist.stripeAccountId }),
          stripe.payouts.list({ limit: 10 }, { stripeAccount: artist.stripeAccountId }),
        ]);
        stripeBalance = bal;
        stripePayouts = sp.data;
      } catch (e) {
        // Stripe not fully onboarded yet — ignore
      }
    }

    return NextResponse.json({
      payouts,
      summary: { totalEarned, totalPaid, totalPending },
      stripeBalance,
      stripePayouts,
      connected: {
        stripe: !!artist.stripeAccountId,
        payfast: !!artist.payfastMerchant,
      },
    });
  } catch (err: any) {
    console.error('[payouts] GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
