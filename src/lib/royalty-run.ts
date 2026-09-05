// ============================================================
// src/lib/royalty-run.ts
//
// Weekly royalty run — the ONLY way payouts are triggered now that
// self-serve on-demand payout requests have been removed (see
// /api/payouts/request, /api/industry/payouts/request, and
// /api/label/payouts/bulk — all POST-disabled).
//
// Runs every Monday via the `royalty_run` cron job. For every artist and
// every industry user with a clearable balance at or above the R50
// minimum and a verified default bank account past its 48h cooldown,
// this creates a payout request for their full available balance and
// immediately approves it (which auto-dispatches via dispatchPayout /
// dispatchIndustryPayout in src/lib/earnings.ts). Nobody has to ask to
// get paid — Vuka pays on a fixed schedule, the way a label pays its
// roster, not on demand the moment a sale lands.
//
// This does NOT change how money accumulates — ArtistPayout rows and the
// IndustryUser.totalEarnings/totalWithdrawn running totals still work
// exactly as before. It only changes who initiates the payout request:
// previously the artist/industry user, via POST; now this scheduled job.
// ============================================================

import prisma from './prisma';
import { requestPayout, approvePayoutRequest } from './payouts';
import { requestIndustryPayout, approveIndustryPayoutRequest } from './industry-payouts';
import { auditLog } from './audit';
import { logger } from './logger';

const MINIMUM_PAYOUT = 50; // R50 — same floor the old self-serve flow used

type RunResult = {
  paid: { id: string; amount: number }[];
  skipped: { id: string; reason: string }[];
};

export async function runWeeklyRoyaltyRun(): Promise<{ artists: RunResult; industry: RunResult }> {
  const artists = await runArtistRoyalties();
  const industry = await runIndustryRoyalties();

  await auditLog.adminAction(
    'royalty_run.completed',
    'System',
    'weekly',
    'system',
    `Artists: ${artists.paid.length} paid, ${artists.skipped.length} skipped. Industry: ${industry.paid.length} paid, ${industry.skipped.length} skipped.`,
  );

  return { artists, industry };
}

async function runArtistRoyalties(): Promise<RunResult> {
  const result: RunResult = { paid: [], skipped: [] };

  // Every artist with at least one unclaimed pending ArtistPayout row.
  const candidates = await prisma.artistPayout.groupBy({
    by: ['artistId'],
    where: { status: 'pending', claimedByPayoutRequestId: null },
    _sum: { amount: true },
  });

  for (const c of candidates) {
    const artistId = c.artistId;
    const available = Math.round((c._sum.amount ?? 0) * 100) / 100;

    if (available < MINIMUM_PAYOUT) {
      result.skipped.push({ id: artistId, reason: `Below R${MINIMUM_PAYOUT} minimum (R${available.toFixed(2)})` });
      continue;
    }

    const bank = await prisma.artistBankAccount.findFirst({
      where: {
        artistId,
        isDefault: true,
        isVerified: true,
        OR: [{ eligibleForPayoutAt: null }, { eligibleForPayoutAt: { lte: new Date() } }],
      },
    });
    if (!bank) {
      result.skipped.push({ id: artistId, reason: 'No verified default bank account past cooldown' });
      continue;
    }

    // Don't stack a new request on top of one still in flight (e.g. a
    // previously rejected request an artist retried, now sitting pending
    // for admin review).
    const inFlight = await prisma.payoutRequest.findFirst({
      where: { artistId, status: { in: ['pending', 'approved', 'processing'] } },
    });
    if (inFlight) {
      result.skipped.push({ id: artistId, reason: 'Already has an in-flight payout request' });
      continue;
    }

    try {
      const request = await requestPayout({
        artistId,
        amount: available,
        currency: 'ZAR',
        bankAccountId: bank.id,
      });
      await approvePayoutRequest(request.id, 'Auto-approved by weekly royalty run');
      result.paid.push({ id: artistId, amount: available });
    } catch (err) {
      logger.error('[royalty-run] artist payout failed', { artistId, error: err instanceof Error ? err.message : String(err) });
      result.skipped.push({ id: artistId, reason: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return result;
}

async function runIndustryRoyalties(): Promise<RunResult> {
  const result: RunResult = { paid: [], skipped: [] };

  // Industry has no per-transaction ledger — totalEarnings/totalWithdrawn
  // running totals ARE the ledger (see src/lib/industry-payouts.ts).
  const industryUsers = await prisma.industryUser.findMany({
    where: { totalEarnings: { gt: 0 } },
    select: { id: true, totalEarnings: true, totalWithdrawn: true },
  });

  for (const u of industryUsers) {
    const inflight = await prisma.industryPayoutRequest.aggregate({
      where: { industryUserId: u.id, status: { in: ['pending', 'approved', 'processing'] } },
      _sum: { amount: true },
    });
    const available = Math.round((u.totalEarnings - u.totalWithdrawn - (inflight._sum.amount ?? 0)) * 100) / 100;

    if (available < MINIMUM_PAYOUT) {
      result.skipped.push({ id: u.id, reason: `Below R${MINIMUM_PAYOUT} minimum (R${available.toFixed(2)})` });
      continue;
    }

    const bank = await prisma.industryBankAccount.findFirst({
      where: {
        industryUserId: u.id,
        isDefault: true,
        isVerified: true,
        OR: [{ eligibleForPayoutAt: null }, { eligibleForPayoutAt: { lte: new Date() } }],
      },
    });
    if (!bank) {
      result.skipped.push({ id: u.id, reason: 'No verified default bank account past cooldown' });
      continue;
    }

    try {
      const request = await requestIndustryPayout({
        industryUserId: u.id,
        amount: available,
        currency: 'ZAR',
        bankAccountId: bank.id,
      });
      await approveIndustryPayoutRequest(request.id, 'Auto-approved by weekly royalty run');
      result.paid.push({ id: u.id, amount: available });
    } catch (err) {
      logger.error('[royalty-run] industry payout failed', { industryUserId: u.id, error: err instanceof Error ? err.message : String(err) });
      result.skipped.push({ id: u.id, reason: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return result;
}
