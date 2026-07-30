// src/lib/earnings.ts
// Royalty & Earnings Processing — payout processors and webhook handlers

import prisma from './prisma';
import { logger } from './logger';
import { getPlan } from './plans';

// ── REVENUE SHARE CALCULATION ─────────────────────────────────

export async function calculateRevenueShare(params: {
  artistId: string;
  grossAmount: number;
  currency: string;
}): Promise<{
  grossAmount: number;
  vukaFeePercent: number;
  vukaFeeAmount: number;
  netAmount: number;
  currency: string;
}> {
  const artist = await prisma.artist.findUnique({
    where:  { id: params.artistId },
    select: { planSlug: true },
  });

  const plan           = getPlan(artist?.planSlug);
  const vukaFeePercent = plan.platformFeePct;
  const vukaFeeAmount  = parseFloat(((params.grossAmount * vukaFeePercent) / 100).toFixed(2));
  const netAmount      = parseFloat((params.grossAmount - vukaFeeAmount).toFixed(2));

  return {
    grossAmount: params.grossAmount,
    vukaFeePercent,
    vukaFeeAmount,
    netAmount,
    currency: params.currency || 'ZAR',
  };
}

// ── PAYOUT PROCESSORS ─────────────────────────────────────────
// Paystack (primary/default), PayFast (legacy), Flutterwave, PayPal
