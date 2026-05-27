// ============================================================
// PHASE 2 — src/lib/payouts.ts
// Expanded payout infrastructure: bank transfers, PayFast,
// PayPal-ready, split payouts, reconciliation, retry.
// ============================================================

import prisma from './prisma';

export type PayoutMethod = 'payfast' | 'bank_transfer' | 'paypal';

// ── Request Payout ────────────────────────────────────────────

export interface PayoutRequestParams {
  artistId: string;
  amount: number;
  currency?: string;
  method: PayoutMethod;
  // Bank
  bankAccountRef?: string;
  bankName?: string;
  accountHolder?: string;
  // PayPal
  paypalEmail?: string;
  // Collaborator splits
  splits?: {
    collaboratorEmail: string;
    collaboratorName: string;
    splitPercent: number;   // e.g. 30 = 30%
    payoutMethod: PayoutMethod;
    paypalEmail?: string;
  }[];
}

export async function requestPayout(params: PayoutRequestParams) {
  const artist = await prisma.artist.findUnique({ where: { id: params.artistId } });
  if (!artist) throw new Error('Artist not found');

  // Validate pending payouts cover the requested amount
  const pendingTotal = await prisma.artistPayout.aggregate({
    where: { artistId: params.artistId, status: 'pending' },
    _sum: { netAmount: true },
  });
  const available = pendingTotal._sum.netAmount || 0;

  if (params.amount > available + 0.01) {
    throw new Error(
      `Requested amount ${params.amount} exceeds available balance ${available.toFixed(2)}`
    );
  }

  // Fetch payout records to sweep
  const payouts = await prisma.artistPayout.findMany({
    where: { artistId: params.artistId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  // Sweep payouts up to requested amount
  let swept = 0;
  const payoutIds: string[] = [];
  for (const p of payouts) {
    if (swept >= params.amount) break;
    payoutIds.push(p.id);
    swept += p.netAmount;
  }

  return prisma.$transaction(async (tx) => {
    // Validate splits
    let splitData: any[] = [];
    if (params.splits && params.splits.length > 0) {
      const totalSplit = params.splits.reduce((s, c) => s + c.splitPercent, 0);
      if (totalSplit > 100) throw new Error('Split percentages exceed 100%');

      splitData = params.splits.map(s => ({
        collaboratorEmail: s.collaboratorEmail,
        collaboratorName: s.collaboratorName,
        splitPercent: s.splitPercent,
        amount: Math.round((params.amount * s.splitPercent) / 100 * 100) / 100,
        currency: params.currency || 'ZAR',
        payoutMethod: s.payoutMethod,
        paypalEmail: s.paypalEmail || '',
        status: 'pending',
      }));
    }

    const request = await tx.payoutRequest.create({
      data: {
        artistId: params.artistId,
        amount: params.amount,
        currency: params.currency || 'ZAR',
        method: params.method,
        bankAccountRef: params.bankAccountRef || '',
        bankName: params.bankName || '',
        accountHolder: params.accountHolder || '',
        paypalEmail: params.paypalEmail || '',
        status: 'pending',
        payoutIds,
        splits: { create: splitData },
      },
      include: { splits: true },
    });

    // Mark swept payouts as processing
    await tx.artistPayout.updateMany({
      where: { id: { in: payoutIds } },
      data: { status: 'processing', notes: `Swept into payout request ${request.id}` },
    });

    return request;
  });
}

// ── Approve Payout Request (admin action) ─────────────────────

export async function approvePayoutRequest(requestId: string, adminNotes?: string) {
  const req = await prisma.payoutRequest.findUnique({
    where: { id: requestId },
    include: { splits: true },
  });
  if (!req) throw new Error('Payout request not found');
  if (req.status !== 'pending') throw new Error(`Request is ${req.status}`);

  await prisma.payoutRequest.update({
    where: { id: requestId },
    data: {
      status: 'approved',
      processedAt: new Date(),
      adminNotes: adminNotes || '',
    },
  });

  // Trigger actual payout (hooks into provider)
  return processPayoutRequest(requestId);
}

// ── Process Payout (provider dispatch) ───────────────────────

export async function processPayoutRequest(requestId: string) {
  const req = await prisma.payoutRequest.findUnique({
    where: { id: requestId },
    include: { splits: true, artist: { include: { user: true } } },
  });
  if (!req) throw new Error('Payout request not found');

  await prisma.payoutRequest.update({
    where: { id: requestId },
    data: { status: 'processing' },
  });

  try {
    // ── Provider routing ─────────────────────────────────────
    // In production: call the actual payment provider APIs.
    // PayFast: use their Payout API (requires merchant integration)
    // Bank: integrate with Investec, Nedbank, or ABSA payment APIs
    // PayPal: use PayPal Payouts API

    let providerRef = '';
    if (req.method === 'payfast') {
      // PayFast payout API call goes here
      // const pf = await payfastPayoutAPI.send({...});
      providerRef = `PF-${Date.now()}`;
    } else if (req.method === 'bank_transfer') {
      // Bank EFT API call
      providerRef = `BT-${Date.now()}`;
    } else if (req.method === 'paypal') {
      // PayPal Payouts API
      providerRef = `PP-${Date.now()}`;
    }

    await prisma.$transaction(async (tx) => {
      await tx.payoutRequest.update({
        where: { id: requestId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          payfastRef: providerRef,
        },
      });

      // Mark swept ArtistPayout records as paid
      await tx.artistPayout.updateMany({
        where: { id: { in: req.payoutIds as string[] } },
        data: {
          status: 'paid',
          processedAt: new Date(),
          payfastRef: providerRef,
        },
      });

      // Update revenue record payoutAmount
      const period = getPeriod();
      await tx.revenueRecord.upsert({
        where: { artistId_period: { artistId: req.artistId, period } },
        create: {
          artistId: req.artistId,
          period,
          grossRevenue: 0,
          platformFees: 0,
          netRevenue: 0,
          payoutAmount: req.amount,
          pendingAmount: 0,
        },
        update: {
          payoutAmount: { increment: req.amount },
          pendingAmount: { decrement: req.amount },
        },
      });

      // Process splits
      for (const split of req.splits) {
        await tx.payoutSplit.update({
          where: { id: split.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            payfastRef: `SPLIT-${Date.now()}-${split.id.slice(0, 6)}`,
          },
        });
      }
    });

    return { success: true, providerRef };
  } catch (err: any) {
    await prisma.payoutRequest.update({
      where: { id: requestId },
      data: {
        status: 'failed',
        failureReason: err?.message || 'Provider error',
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
      },
    });

    // Roll back swept payouts to pending
    await prisma.artistPayout.updateMany({
      where: { id: { in: req.payoutIds as string[] } },
      data: { status: 'pending', notes: 'Reverted — payout request failed' },
    });

    throw err;
  }
}

// ── Retry Failed Payout ───────────────────────────────────────

export async function retryPayoutRequest(requestId: string) {
  const req = await prisma.payoutRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error('Payout request not found');
  if (req.status !== 'failed') throw new Error('Can only retry failed payout requests');
  if ((req.retryCount || 0) >= 3) throw new Error('Max retry attempts reached — contact admin');

  await prisma.payoutRequest.update({
    where: { id: requestId },
    data: { status: 'approved' },
  });

  return processPayoutRequest(requestId);
}

// ── Reconciliation Report ─────────────────────────────────────

export async function getPayoutReconciliation(artistId: string) {
  const [pending, processing, completed, failed] = await Promise.all([
    prisma.artistPayout.aggregate({
      where: { artistId, status: 'pending' },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.artistPayout.aggregate({
      where: { artistId, status: 'processing' },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.artistPayout.aggregate({
      where: { artistId, status: 'paid' },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.artistPayout.aggregate({
      where: { artistId, status: 'failed' },
      _sum: { netAmount: true },
      _count: true,
    }),
  ]);

  const requests = await prisma.payoutRequest.findMany({
    where: { artistId },
    orderBy: { requestedAt: 'desc' },
    take: 20,
    include: { splits: true },
  });

  return {
    balance: {
      available:  pending._sum.netAmount   || 0,
      processing: processing._sum.netAmount || 0,
      paid:       completed._sum.netAmount  || 0,
      failed:     failed._sum.netAmount     || 0,
    },
    counts: {
      pending:    pending._count,
      processing: processing._count,
      paid:       completed._count,
      failed:     failed._count,
    },
    recentRequests: requests,
  };
}

// ── Bank Account Management ───────────────────────────────────

export async function addBankAccount(
  artistId: string,
  data: {
    accountType: 'bank' | 'paypal' | 'payfast';
    bankName?: string;
    branchCode?: string;
    accountNumber?: string;
    accountHolder?: string;
    accountType2?: string;
    paypalEmail?: string;
    payfastMerchantId?: string;
    isDefault?: boolean;
  }
) {
  if (data.isDefault) {
    // Unset existing default
    await prisma.artistBankAccount.updateMany({
      where: { artistId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.artistBankAccount.create({
    data: {
      artistId,
      accountType: data.accountType,
      bankName: data.bankName || '',
      branchCode: data.branchCode || '',
      accountNumber: data.accountNumber || '',
      accountHolder: data.accountHolder || '',
      accountType2: data.accountType2 || '',
      paypalEmail: data.paypalEmail || '',
      payfastMerchantId: data.payfastMerchantId || '',
      isDefault: data.isDefault || false,
    },
  });
}

function getPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
