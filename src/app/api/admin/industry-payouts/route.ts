/**
 * GET  /api/admin/industry-payouts?status=pending|approved|paid|rejected|all&page=1
 * POST /api/admin/industry-payouts { requestId, action: approve|reject|mark_paid, notes?, reference? }
 *
 * Mirrors /api/admin/payouts (artist) for industry users.
 *
 * Payout security: approve and mark_paid are gated on the destination
 * bank account being verified and past its 48h eligibility cooldown,
 * same as the artist flow.
 *
 * mark_paid increments IndustryUser.totalWithdrawn directly instead of
 * writing a separate ledger row — there is no IndustryPayout model;
 * the IndustryPayoutRequest itself (status: 'paid') IS the payment record.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import {
  sendPayoutApproved,
  sendPayoutProcessed,
  sendPayoutFailed,
} from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit  = 50;

  try {
    const where = status === 'all' ? {} : { status };
    const [requests, total] = await Promise.all([
      prisma.industryPayoutRequest.findMany({
        where,
        include: {
          industryUser: {
            select: {
              id: true, companyName: true,
              user: { select: { email: true } },
            },
          },
          bankAccount: {
            select: {
              bankName: true, accountHolder: true,
              maskedNumber: true, branchCode: true, accountType: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.industryPayoutRequest.count({ where }),
    ]);

    const [pendingAgg, paidAgg] = await Promise.all([
      prisma.industryPayoutRequest.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.industryPayoutRequest.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      requests,
      total,
      page,
      pages: Math.ceil(total / limit),
      summary: {
        pendingCount:  pendingAgg._count,
        pendingAmount: pendingAgg._sum.amount || 0,
        paidCount:     paidAgg._count,
        paidAmount:    paidAgg._sum.amount || 0,
      },
    });
  } catch (err) {
    console.error('[admin/industry-payouts] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { requestId, action, notes, reference } = await req.json();
    if (!requestId || !action)
      return NextResponse.json({ error: 'requestId and action required' }, { status: 400 });

    const request = await prisma.industryPayoutRequest.findUnique({
      where: { id: requestId },
      include: {
        industryUser: { select: { companyName: true, user: { select: { email: true } } } },
        bankAccount: true,
      },
    });
    if (!request) return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });

    // Gate on bank account verification + cooldown for bank-transfer payouts.
    if ((action === 'approve' || action === 'mark_paid') && request.bankAccountId) {
      const acct = request.bankAccount;
      if (!acct?.isVerified) {
        return NextResponse.json(
          { error: 'Cannot process payout: bank account is not verified.' },
          { status: 409 }
        );
      }
      if (acct.eligibleForPayoutAt && acct.eligibleForPayoutAt > new Date()) {
        return NextResponse.json(
          {
            error: `Cannot process payout: bank account is still in its 48h cooldown until ${acct.eligibleForPayoutAt.toISOString()}.`,
          },
          { status: 409 }
        );
      }
    }

    switch (action) {
      case 'approve': {
        if (request.status !== 'pending')
          return NextResponse.json({ error: 'Can only approve pending requests' }, { status: 409 });
        await prisma.industryPayoutRequest.update({
          where: { id: requestId },
          data: { status: 'approved', approvedAt: new Date(), adminNotes: notes || '' },
        });
        await auditLog.adminAction('payment.industry_payout_approved', 'IndustryPayoutRequest', requestId, user.id, notes || '');
        try {
          const industryEmail = request.industryUser?.user?.email;
          if (industryEmail) {
            await sendPayoutApproved({
              to: industryEmail,
              artistName: request.industryUser?.companyName || 'there',
              amount: Number(request.amount),
              currency: request.currency || 'ZAR',
              payoutMethod: request.bankAccountId ? 'Bank Transfer' : 'Paystack',
              referenceNumber: request.id,
              processingDays: 2,
              payoutsUrl: `${APP_URL()}/dashboard/industry/payouts`,
            });
          }
        } catch (e) { console.error('[admin/industry-payouts] approve email failed:', e); }
        return NextResponse.json({ ok: true, status: 'approved' });
      }
      case 'reject': {
        if (!['pending', 'approved'].includes(request.status))
          return NextResponse.json({ error: 'Can only reject pending or approved requests' }, { status: 409 });
        await prisma.industryPayoutRequest.update({
          where: { id: requestId },
          data: { status: 'rejected', adminNotes: notes || 'Rejected by admin' },
        });
        await auditLog.adminAction('payment.industry_payout_rejected', 'IndustryPayoutRequest', requestId, user.id, notes || '');
        try {
          const industryEmail = request.industryUser?.user?.email;
          if (industryEmail) {
            await sendPayoutFailed({
              to: industryEmail,
              artistName: request.industryUser?.companyName || 'there',
              amount: Number(request.amount),
              currency: request.currency || 'ZAR',
              reason: notes || 'Your payout request was rejected by admin. Please contact support for more details.',
              referenceNumber: request.id,
              payoutsUrl: `${APP_URL()}/dashboard/industry/payouts`,
            });
          }
        } catch (e) { console.error('[admin/industry-payouts] reject email failed:', e); }
        return NextResponse.json({ ok: true, status: 'rejected' });
      }
      case 'mark_paid': {
        if (request.status !== 'approved')
          return NextResponse.json({ error: 'Can only mark approved requests as paid' }, { status: 409 });

        await prisma.$transaction(async (tx) => {
          await tx.industryPayoutRequest.update({
            where: { id: requestId },
            data: {
              status: 'paid',
              processedAt: new Date(),
              paystackReference: reference || undefined,
              adminNotes: notes || '',
            },
          });
          // No separate ledger table (unlike ArtistPayout) — debit the
          // running total directly since totalWithdrawn IS the ledger.
          await tx.industryUser.update({
            where: { id: request.industryUserId },
            data: { totalWithdrawn: { increment: request.amount } },
          });
        });

        await auditLog.adminAction(
          'payment.industry_payout_processed',
          'IndustryPayoutRequest',
          requestId,
          user.id,
          `ref=${reference || 'none'}`,
        );
        try {
          const industryEmail = request.industryUser?.user?.email;
          if (industryEmail) {
            await sendPayoutProcessed({
              to: industryEmail,
              artistName: request.industryUser?.companyName || 'there',
              amount: Number(request.amount),
              currency: request.currency || 'ZAR',
              payoutMethod: request.bankAccountId ? 'Bank Transfer' : 'Paystack',
              referenceNumber: reference || request.id,
              bankLast4: (request as any).bankAccount?.maskedNumber?.slice(-4),
              payoutsUrl: `${APP_URL()}/dashboard/industry/payouts`,
            });
          }
        } catch (e) { console.error('[admin/industry-payouts] mark_paid email failed:', e); }
        return NextResponse.json({ ok: true, status: 'paid' });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[admin/industry-payouts] POST error:', err?.message);
    return NextResponse.json({ error: 'Action failed' }, { status: 503 });
  }
}
