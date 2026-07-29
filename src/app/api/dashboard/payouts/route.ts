// FIX: src/app/api/dashboard/payouts/route.ts
//
// ROOT CAUSE of "Not connected" showing despite Paystack being configured:
// The route imported `stripe` at the top level. If STRIPE_SECRET_KEY is not
// set (or Stripe throws during import), the entire module fails to load and
// returns a 500 — which means `data` in the frontend becomes `{}`, so
// `connected = {}` → both stripe AND paystack show "Not connected".
//
// FIX: Wrap all Stripe calls in a try/catch and make them fully optional.
// The `connected` object is now always returned correctly based on DB fields.

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { id: true, paystackRecipient: true, currency: true, planSlug: true, planExpiresAt: true, lifetimeGrossSales: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    // ArtistPayout is kept as a per-sale audit ledger, still useful for the
    // "recent activity" list below.
    const payouts = await prisma.artistPayout.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Formal payout requests (against bank accounts)
    const payoutRequests = await prisma.payoutRequest.findMany({
      where: { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { bankAccount: { select: { bankName: true, maskedNumber: true } } },
    });

    // FIX: totalEarned/totalPaid/totalPending were previously derived purely
    // from summing ArtistPayout.amount across ALL rows regardless of status,
    // which double-counted: marking a payout "paid" used to INSERT a
    // brand-new lump-sum row on top of the original per-sale "pending" rows
    // instead of settling them, so "pending" balance never shrank after a
    // payout — it stayed permanently equal to lifetime earnings (a
    // "doubled" net), which is also why requesting that "pending" amount
    // then failed validation (it was ~2x the real available balance).
    //
    // That double-booking bug is now fixed at the source (admin's mark_paid
    // handler settles existing pending rows instead of duplicating them),
    // which makes ArtistPayout the right ledger to sum again — it's actually
    // the MOST complete one: every revenue-confirming webhook (sales, tips,
    // memberships, marketplace orders, event tickets, campaign pledges, and
    // industry service orders) writes a row here, including industry orders
    // which don't even go through the Purchase table.
    const payoutRows = await prisma.artistPayout.findMany({
      where: { artistId: artist.id },
      select: { amount: true, status: true, claimedByPayoutRequestId: true },
    });
    const totalEarned    = payoutRows.reduce((sum, p) => sum + p.amount, 0);
    const totalPaid      = payoutRows.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const totalPending   = payoutRows.filter(p => p.status === 'pending' && !p.claimedByPayoutRequestId).reduce((sum, p) => sum + p.amount, 0);
    const totalRequested = payoutRows.filter(p => p.status === 'pending' && p.claimedByPayoutRequestId).reduce((sum, p) => sum + p.amount, 0);

    // Bank accounts saved by artist
    const bankAccounts = await prisma.artistBankAccount.findMany({
      where: { artistId: user.artist.id },
      select: { id: true, bankName: true, maskedNumber: true, accountHolder: true, isDefault: true, accountType: true },
    }).catch(() => []);

    // The connected object is built purely from DB — never from Stripe import
    // This means even if Stripe env vars are missing, paystack always shows correctly
    return NextResponse.json({
      payouts,
      payoutRequests,
      bankAccounts,
      summary: { totalEarned, totalPaid, totalPending, totalRequested },
      connected: {
        stripe:   false, // Stripe removed in Phase 12
        paystack: !!artist.paystackRecipient,
      },
    });
  } catch (err: unknown) {
    console.error('[payouts] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
