// ============================================================
// src/lib/industry-payouts.ts
// Mirrors src/lib/payouts.ts (artist payouts) for industry users.
//
// KEY DIFFERENCE FROM ARTIST SIDE:
// Artists derive available balance from summing the ArtistPayout ledger
// (status: 'pending' rows minus in-flight PayoutRequests) because revenue
// events write individual ArtistPayout rows.
//
// Industry users do NOT have a per-event ledger table. Revenue from
// industry service orders is credited directly onto running totals on
// IndustryUser: totalEarnings (lifetime gross credited) and
// totalWithdrawn (lifetime amount actually paid out). Available balance
// is therefore:
//
//   available = totalEarnings - totalWithdrawn - (pending + approved IndustryPayoutRequest amounts)
//
// markPayoutPaid increments totalWithdrawn directly instead of writing a
// separate ledger row, since there is no IndustryPayout model — the
// IndustryPayoutRequest itself IS the record of payment (status: 'paid').
// ============================================================

import prisma from './prisma';

// ── Request a Payout ──────────────────────────────────────────

export async function requestIndustryPayout(params: {
  industryUserId: string;
  amount: number;
  currency?: string;
  bankAccountId?: string;
  method?: string;
  paypalEmail?: string;
}) {
  const industryUser = await prisma.industryUser.findUnique({ where: { id: params.industryUserId } });
  if (!industryUser) throw new Error('Industry user not found');

  const alreadyRequested = await prisma.industryPayoutRequest.aggregate({
    where: { industryUserId: params.industryUserId, status: { in: ['pending', 'approved'] } },
    _sum: { amount: true },
  });

  const available =
    industryUser.totalEarnings - industryUser.totalWithdrawn - (alreadyRequested._sum.amount ?? 0);

  if (params.amount > available + 0.01) {
    throw new Error(`Requested ${params.amount} exceeds available balance ${available.toFixed(2)}`);
  }

  return prisma.industryPayoutRequest.create({
    data: {
      industryUserId: params.industryUserId,
      amount:         params.amount,
      currency:       params.currency || 'ZAR',
      bankAccountId:  params.bankAccountId,
      method:         params.method || 'bank_transfer',
      paypalEmail:    params.paypalEmail,
      status:         'pending',
      adminNotes:     '',
    },
  });
}

// ── Admin: Approve Payout Request ────────────────────────────

export async function approveIndustryPayoutRequest(requestId: string, notes?: string) {
  const req = await prisma.industryPayoutRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error('Payout request not found');
  if (req.status !== 'pending') throw new Error(`Already ${req.status}`);

  return prisma.industryPayoutRequest.update({
    where: { id: requestId },
    data: { status: 'approved', approvedAt: new Date(), ...(notes ? { adminNotes: notes } : {}) },
  });
}

// ── Admin: Mark Payout Paid ───────────────────────────────────

export async function markIndustryPayoutPaid(requestId: string, reference: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.industryPayoutRequest.update({
      where: { id: requestId },
      data: {
        status:            'paid',
        processedAt:       new Date(),
        paystackReference: reference,
        adminNotes:        `Ref: ${reference}`,
      },
    });

    // No separate ledger row (unlike ArtistPayout) — debit the running
    // total directly since IndustryUser.totalWithdrawn IS the ledger.
    await tx.industryUser.update({
      where: { id: req.industryUserId },
      data: { totalWithdrawn: { increment: req.amount } },
    });

    return req;
  });
}

// ── Admin: Reject Payout Request ─────────────────────────────

export async function rejectIndustryPayoutRequest(requestId: string, reason: string) {
  return prisma.industryPayoutRequest.update({
    where: { id: requestId },
    data: { status: 'rejected', adminNotes: reason },
  });
}

// ── Get Reconciliation ────────────────────────────────────────

export async function getIndustryPayoutReconciliation(industryUserId: string) {
  const [industryUser, pending, paid, rejected] = await Promise.all([
    prisma.industryUser.findUnique({ where: { id: industryUserId } }),
    prisma.industryPayoutRequest.aggregate({ where: { industryUserId, status: 'pending' }, _sum: { amount: true }, _count: true }),
    prisma.industryPayoutRequest.aggregate({ where: { industryUserId, status: 'paid' }, _sum: { amount: true }, _count: true }),
    prisma.industryPayoutRequest.aggregate({ where: { industryUserId, status: 'rejected' }, _sum: { amount: true }, _count: true }),
  ]);

  const alreadyRequested = pending._sum.amount ?? 0;
  const available = industryUser
    ? industryUser.totalEarnings - industryUser.totalWithdrawn - alreadyRequested
    : 0;

  const requests = await prisma.industryPayoutRequest.findMany({
    where: { industryUserId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { bankAccount: { select: { bankName: true, maskedNumber: true } } },
  });

  return {
    balance: {
      totalEarnings:  industryUser?.totalEarnings ?? 0,
      totalWithdrawn: industryUser?.totalWithdrawn ?? 0,
      available,
      pending:        pending._sum.amount ?? 0,
      paid:           paid._sum.amount ?? 0,
      rejected:       rejected._sum.amount ?? 0,
    },
    counts: {
      pending:  pending._count,
      paid:     paid._count,
      rejected: rejected._count,
    },
    requests,
  };
}

// ── Get Payout History ────────────────────────────────────────

export async function getIndustryPayoutHistory(industryUserId: string) {
  return prisma.industryPayoutRequest.findMany({
    where: { industryUserId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

// ── Retry Rejected Payout ───────────────────────────────────────

export async function retryIndustryPayoutRequest(requestId: string) {
  const req = await prisma.industryPayoutRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error('Payout request not found');
  if (req.status !== 'rejected') throw new Error('Only rejected requests can be retried');
  return prisma.industryPayoutRequest.update({
    where: { id: requestId },
    data: { status: 'pending', adminNotes: 'Retried by industry user', processedAt: null },
  });
}

// ── Add Bank Account ──────────────────────────────────────────

export async function addIndustryBankAccount(params: {
  industryUserId: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  branchCode?: string;
  accountType?: string;
  paypalEmail?: string;
  paystackAccountCode?: string;
  setAsDefault?: boolean;
}) {
  const accountNumber = params.accountNumber || '';
  const masked = accountNumber.length > 4
    ? accountNumber.slice(-4).padStart(accountNumber.length, '*')
    : accountNumber;

  if (params.setAsDefault) {
    await prisma.industryBankAccount.updateMany({
      where: { industryUserId: params.industryUserId },
      data: { isDefault: false },
    });
  }

  return prisma.industryBankAccount.create({
    data: {
      industryUserId:      params.industryUserId,
      bankName:            params.bankName      || '',
      accountHolder:       params.accountHolder || '',
      accountNumber:       accountNumber,
      maskedNumber:        masked,
      branchCode:          params.branchCode    || '',
      accountType:         params.accountType   || 'current',
      paypalEmail:         params.paypalEmail,
      paystackAccountCode: params.paystackAccountCode,
      isDefault:           params.setAsDefault  || false,
    },
  });
}
