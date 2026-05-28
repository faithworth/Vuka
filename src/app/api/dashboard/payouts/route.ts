export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { id: true, stripeAccountId: true, payfastMerchant: true, currency: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    // ArtistPayout uses `amount` — netAmount does not exist on this model
    const payouts = await prisma.artistPayout.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const totalEarned  = payouts.reduce((sum, p) => sum + p.amount, 0);
    const totalPaid    = payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const totalPending = payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

    // Formal payout requests (against bank accounts)
    const payoutRequests = await prisma.payoutRequest.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { bankAccount: { select: { bankName: true, maskedNumber: true } } },
    });

    // Stripe balance if connected
    let stripeBalance: object | null = null;
    let stripePayouts: object[] = [];
    if (artist.stripeAccountId) {
      try {
        const [bal, sp] = await Promise.all([
          stripe.balance.retrieve({ stripeAccount: artist.stripeAccountId }),
          stripe.payouts.list({ limit: 10 }, { stripeAccount: artist.stripeAccountId }),
        ]);
        stripeBalance = bal;
        stripePayouts = sp.data;
      } catch {
        // Stripe not fully onboarded yet — ignore
      }
    }

    return NextResponse.json({
      payouts,
      payoutRequests,
      summary: { totalEarned, totalPaid, totalPending },
      stripeBalance,
      stripePayouts,
      connected: {
        stripe: !!artist.stripeAccountId,
        payfast: !!artist.payfastMerchant,
      },
    });
  } catch (err: unknown) {
    console.error('[payouts] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
