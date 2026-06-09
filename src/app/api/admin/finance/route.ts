/**
 * GET /api/admin/finance?view=overview|purchases|tips|artist|payouts
 * Platform-wide financial data for the admin finance page.
 *
 * Purchase has NO artistId — artist is resolved through the
 * linked item (beat, release, video, sample).
 * SupportTxn has NO platformFee/netAmount — computed at 8 % / 92 %.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

const PLATFORM_RATE = 0.08; // 8 % Vuka cut

// Helper: resolve the artist for a Purchase row by checking each item relation.
function resolveArtist(p: {
  beat?: { artistId: string; artist?: any } | null;
  release?: { artistId: string; artist?: any } | null;
  video?: { artistId: string; artist?: any } | null;
  sample?: { artistId: string; artist?: any } | null;
}) {
  return (
    p.beat?.artist ||
    p.release?.artist ||
    p.video?.artist ||
    p.sample?.artist ||
    null
  );
}

function resolveArtistId(p: {
  beat?: { artistId: string } | null;
  release?: { artistId: string } | null;
  video?: { artistId: string } | null;
  sample?: { artistId: string } | null;
}) {
  return (
    p.beat?.artistId ||
    p.release?.artistId ||
    p.video?.artistId ||
    p.sample?.artistId ||
    null
  );
}

// Common include for Purchase → artist via item
const PURCHASE_INCLUDE = {
  beat: {
    select: {
      artistId: true, title: true,
      artist: { select: { id: true, name: true, photoUrl: true } },
    },
  },
  release: {
    select: {
      artistId: true, title: true,
      artist: { select: { id: true, name: true, photoUrl: true } },
    },
  },
  video: {
    select: {
      artistId: true, title: true,
      artist: { select: { id: true, name: true, photoUrl: true } },
    },
  },
  sample: {
    select: {
      artistId: true, title: true,
      artist: { select: { id: true, name: true, photoUrl: true } },
    },
  },
} as const;

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'overview';

  try {
    // ─── OVERVIEW ────────────────────────────────────────────────────────────
    if (view === 'overview') {
      const now    = new Date();
      const d30    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // All confirmed purchases
      const [allPurchases, monthPurchases, allTips, monthTips, paidPayouts, pendingPayouts] =
        await Promise.all([
          prisma.purchase.findMany({
            where: { status: 'confirmed' },
            select: { amount: true, platformFee: true, netAmount: true },
          }),
          prisma.purchase.findMany({
            where: { status: 'confirmed', createdAt: { gte: d30 } },
            select: { amount: true, platformFee: true, netAmount: true },
          }),
          prisma.supportTxn.findMany({
            where: { status: 'confirmed' },
            select: { amount: true },
          }),
          prisma.supportTxn.findMany({
            where: { status: 'confirmed', createdAt: { gte: d30 } },
            select: { amount: true },
          }),
          prisma.payoutRequest.aggregate({
            where: { status: 'paid' },
            _sum: { amount: true },
            _count: true,
          }),
          prisma.payoutRequest.aggregate({
            where: { status: 'pending' },
            _sum: { amount: true },
            _count: true,
          }),
        ]);

      const sumPurchases = allPurchases.reduce(
        (a, p) => ({
          gross: a.gross + (p.amount || 0),
          platform: a.platform + (p.platformFee || 0),
          net: a.net + (p.netAmount || 0),
        }),
        { gross: 0, platform: 0, net: 0 },
      );
      const sumTips = allTips.reduce((a, t) => a + (t.amount || 0), 0);
      const tipPlatform = sumTips * PLATFORM_RATE;
      const tipNet = sumTips * (1 - PLATFORM_RATE);

      const sumMonthPurchases = monthPurchases.reduce(
        (a, p) => ({
          gross: a.gross + (p.amount || 0),
          platform: a.platform + (p.platformFee || 0),
        }),
        { gross: 0, platform: 0 },
      );
      const sumMonthTips = monthTips.reduce((a, t) => a + (t.amount || 0), 0);

      // Sales by type — from confirmed purchases
      const salesByTypeMap: Record<string, { count: number; gross: number; platform: number }> = {};
      for (const p of allPurchases) {
        // We can't groupBy itemType here without a raw query, so we skip type breakdown in overview
        // (SalesTab has per-row itemType; here we just show totals)
      }

      // Per-purchase groupBy type needs all rows — so do a separate aggregation
      const salesByTypeRows = await prisma.purchase.groupBy({
        by: ['itemType'],
        where: { status: 'confirmed' },
        _sum: { amount: true, platformFee: true },
        _count: true,
      });

      // Top artists — get all confirmed purchases with artist info, then aggregate in JS
      const topPurchases = await prisma.purchase.findMany({
        where: { status: 'confirmed' },
        select: {
          amount: true,
          platformFee: true,
          netAmount: true,
          beat:    { select: { artistId: true, artist: { select: { id: true, name: true, photoUrl: true } } } },
          release: { select: { artistId: true, artist: { select: { id: true, name: true, photoUrl: true } } } },
          video:   { select: { artistId: true, artist: { select: { id: true, name: true, photoUrl: true } } } },
          sample:  { select: { artistId: true, artist: { select: { id: true, name: true, photoUrl: true } } } },
        },
      });

      const topTips = await prisma.supportTxn.findMany({
        where: { status: 'confirmed' },
        select: { artistId: true, amount: true, artist: { select: { id: true, name: true, photoUrl: true } } },
      });

      // All paid payouts per artist
      const paidPerArtist = await prisma.payoutRequest.groupBy({
        by: ['artistId'],
        where: { status: 'paid' },
        _sum: { amount: true },
      });
      const paidMap: Record<string, number> = {};
      for (const r of paidPerArtist) paidMap[r.artistId] = r._sum.amount || 0;

      // Pending payout requests per artist (to show what's already in-flight)
      const pendingPerArtist = await prisma.payoutRequest.groupBy({
        by: ['artistId'],
        where: { status: { in: ['pending', 'approved'] } },
        _sum: { amount: true },
      });
      const pendingMap: Record<string, number> = {};
      for (const r of pendingPerArtist) pendingMap[r.artistId] = r._sum.amount || 0;

      // Default bank account per artist
      const allDefaultAccounts = await prisma.artistBankAccount.findMany({
        where: { isDefault: true },
        select: {
          artistId: true, id: true,
          bankName: true, accountHolder: true,
          maskedNumber: true, branchCode: true, accountType: true,
        },
      });
      const bankMap: Record<string, any> = {};
      for (const a of allDefaultAccounts) bankMap[a.artistId] = a;

      // Aggregate per artist
      const artistMap: Record<string, {
        artist: any; grossSales: number; platformCut: number; artistOwes: number;
        salesCount: number; tipsCount: number; grossTips: number; payoutsTotal: number;
        pendingRequests: number; defaultBank: any;
      }> = {};

      for (const p of topPurchases) {
        const artistId = resolveArtistId(p as any);
        const artist   = resolveArtist(p as any);
        if (!artistId) continue;
        if (!artistMap[artistId]) {
          artistMap[artistId] = {
            artist, grossSales: 0, platformCut: 0, artistOwes: 0,
            salesCount: 0, tipsCount: 0, grossTips: 0, payoutsTotal: 0,
            pendingRequests: 0, defaultBank: bankMap[artistId] || null,
          };
        }
        artistMap[artistId].grossSales  += p.amount || 0;
        artistMap[artistId].platformCut += p.platformFee || 0;
        artistMap[artistId].artistOwes  += p.netAmount || 0;
        artistMap[artistId].salesCount  += 1;
      }

      for (const t of topTips) {
        const { artistId, artist } = t;
        if (!artistMap[artistId]) {
          artistMap[artistId] = {
            artist, grossSales: 0, platformCut: 0, artistOwes: 0,
            salesCount: 0, tipsCount: 0, grossTips: 0, payoutsTotal: 0,
            pendingRequests: 0, defaultBank: bankMap[artistId] || null,
          };
        }
        artistMap[artistId].grossTips  += t.amount || 0;
        artistMap[artistId].artistOwes += (t.amount || 0) * (1 - PLATFORM_RATE);
        artistMap[artistId].platformCut += (t.amount || 0) * PLATFORM_RATE;
        artistMap[artistId].tipsCount  += 1;
      }

      for (const id of Object.keys(artistMap)) {
        artistMap[id].payoutsTotal      = paidMap[id] || 0;
        artistMap[id].pendingRequests   = pendingMap[id] || 0;
        if (!artistMap[id].defaultBank) artistMap[id].defaultBank = bankMap[id] || null;
      }

      const topArtists = Object.entries(artistMap)
        .map(([artistId, data]) => ({ artistId, ...data }))
        .sort((a, b) => (b.grossSales + b.grossTips) - (a.grossSales + a.grossTips))
        .slice(0, 20);

      return NextResponse.json({
        revenue: {
          gross:            sumPurchases.gross + sumTips,
          platformCut:      sumPurchases.platform + tipPlatform,
          artistTotal:      sumPurchases.net + tipNet,
          salesCount:       allPurchases.length,
          tipsCount:        allTips.length,
          monthGross:       sumMonthPurchases.gross + sumMonthTips,
          monthPlatform:    sumMonthPurchases.platform + sumMonthTips * PLATFORM_RATE,
          monthSalesCount:  monthPurchases.length,
          monthTipsCount:   monthTips.length,
        },
        payouts: {
          paidAmount:    paidPayouts._sum.amount  || 0,
          paidCount:     paidPayouts._count,
          pendingAmount: pendingPayouts._sum.amount || 0,
          pendingCount:  pendingPayouts._count,
        },
        topArtists,
        salesByType: salesByTypeRows,
      });
    }

    // ─── PURCHASES (all sales / paginated) ────────────────────────────────────
    if (view === 'purchases') {
      const page  = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const limit = 50;
      const q     = searchParams.get('q') || '';

      const where: any = { status: 'confirmed' };
      if (q) {
        where.OR = [
          { buyerEmail: { contains: q, mode: 'insensitive' } },
          { buyerName:  { contains: q, mode: 'insensitive' } },
        ];
      }

      const [purchases, total] = await Promise.all([
        prisma.purchase.findMany({
          where,
          include: PURCHASE_INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip:    (page - 1) * limit,
          take:    limit,
        }),
        prisma.purchase.count({ where }),
      ]);

      const rows = purchases.map((p) => ({
        ...p,
        artist: resolveArtist(p as any),
      }));

      return NextResponse.json({
        purchases: rows,
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    }

    // ─── TIPS ─────────────────────────────────────────────────────────────────
    if (view === 'tips') {
      const page  = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const limit = 50;

      const [tips, total] = await Promise.all([
        prisma.supportTxn.findMany({
          where: { status: 'confirmed' },
          include: { artist: { select: { id: true, name: true, photoUrl: true } } },
          orderBy: { createdAt: 'desc' },
          skip:    (page - 1) * limit,
          take:    limit,
        }),
        prisma.supportTxn.count({ where: { status: 'confirmed' } }),
      ]);

      const rows = tips.map((t) => ({
        ...t,
        platformFee: t.amount * PLATFORM_RATE,
        netAmount:   t.amount * (1 - PLATFORM_RATE),
      }));

      return NextResponse.json({ tips: rows, total, page, pages: Math.ceil(total / limit) });
    }

    // ─── ARTIST DETAIL ────────────────────────────────────────────────────────
    if (view === 'artist') {
      const artistId = searchParams.get('id');
      if (!artistId) return NextResponse.json({ error: 'id required' }, { status: 400 });

      const [artist, rawPurchases, tips, payoutRequests, artistPayouts, bankAccounts] = await Promise.all([
        prisma.artist.findUnique({
          where:  { id: artistId },
          select: { id: true, name: true, photoUrl: true, slug: true },
        }),
        // Purchases where any item belongs to this artist
        prisma.purchase.findMany({
          where: {
            status: 'confirmed',
            OR: [
              { beat:    { artistId } },
              { release: { artistId } },
              { video:   { artistId } },
              { sample:  { artistId } },
            ],
          },
          include: PURCHASE_INCLUDE,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.supportTxn.findMany({
          where:   { artistId, status: 'confirmed' },
          include: { artist: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.payoutRequest.findMany({
          where:   { artistId },
          include: {
            bankAccount: {
              select: { id: true, bankName: true, accountHolder: true, maskedNumber: true, branchCode: true, accountType: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.artistPayout.findMany({
          where:   { artistId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.artistBankAccount.findMany({
          where:   { artistId },
          select: {
            id: true, bankName: true, accountHolder: true,
            maskedNumber: true, branchCode: true, accountType: true, isDefault: true,
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        }),
      ]);

      const purchases = rawPurchases.map((p) => ({
        ...p,
        artist: resolveArtist(p as any),
      }));

      const tipsWithFees = tips.map((t) => ({
        ...t,
        platformFee: t.amount * PLATFORM_RATE,
        netAmount:   t.amount * (1 - PLATFORM_RATE),
      }));

      const grossSales    = purchases.reduce((a, p) => a + (p.amount || 0), 0);
      const grossTips     = tips.reduce((a, t) => a + (t.amount || 0), 0);
      const salesPlatform = purchases.reduce((a, p) => a + (p.platformFee || 0), 0);
      const tipsPlatform  = grossTips * PLATFORM_RATE;
      const totalPlatform = salesPlatform + tipsPlatform;
      const salesNet      = purchases.reduce((a, p) => a + (p.netAmount || 0), 0);
      const tipsNet       = grossTips * (1 - PLATFORM_RATE);
      const totalEarned   = salesNet + tipsNet;
      const paidOut       = payoutRequests
        .filter((r) => r.status === 'paid')
        .reduce((a, r) => a + r.amount, 0);
      const balance       = totalEarned - paidOut;

      return NextResponse.json({
        artist,
        summary: {
          grossSales,
          grossTips,
          totalPlatform,
          totalEarned,
          paidOut,
          balance,
          salesCount:  purchases.length,
          tipsCount:   tips.length,
        },
        purchases,
        tips: tipsWithFees,
        payoutRequests,
        payoutsLedger: artistPayouts,
        bankAccounts,
      });
    }

    // ─── PAYOUTS (delegates to /api/admin/payouts but we mirror it here) ──────
    if (view === 'payouts') {
      const status = searchParams.get('status') || 'all';
      const page   = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const limit  = 50;

      const where: any = status === 'all' ? {} : { status };

      const [requests, total, pendingAgg, paidAgg] = await Promise.all([
        prisma.payoutRequest.findMany({
          where,
          include: {
            artist: {
              select: {
                id: true, name: true, slug: true,
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
          orderBy: { createdAt: 'desc' },
          skip:    (page - 1) * limit,
          take:    limit,
        }),
        prisma.payoutRequest.count({ where }),
        prisma.payoutRequest.aggregate({ where: { status: 'pending' }, _sum: { amount: true }, _count: true }),
        prisma.payoutRequest.aggregate({ where: { status: 'paid' },    _sum: { amount: true }, _count: true }),
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
          paidAmount:    paidAgg._sum.amount   || 0,
        },
      });
    }

    return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
  } catch (err) {
    console.error('[admin/finance] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

/**
 * POST /api/admin/finance
 * Admin-initiated payout actions:
 *   { action: 'create_payout', artistId, amount, bankAccountId, notes }
 *     → creates a PayoutRequest with status 'approved' (bypasses artist request step)
 *   { action: 'mark_paid', requestId, reference, notes }
 *     → marks an approved PayoutRequest as paid and writes ArtistPayout ledger entry
 *   { action: 'approve', requestId, notes }
 *     → moves pending → approved
 *   { action: 'reject', requestId, notes }
 *     → moves pending|approved → rejected
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    // ── Create payout (admin initiates without artist request) ────────────────
    if (action === 'create_payout') {
      const { artistId, amount, bankAccountId, notes } = body;
      if (!artistId || !amount) {
        return NextResponse.json({ error: 'artistId and amount required' }, { status: 400 });
      }
      if (amount <= 0) {
        return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
      }

      const artist = await prisma.artist.findUnique({ where: { id: artistId } });
      if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

      if (bankAccountId) {
        const acct = await prisma.artistBankAccount.findFirst({
          where: { id: bankAccountId, artistId },
        });
        if (!acct) return NextResponse.json({ error: 'Bank account not found or does not belong to artist' }, { status: 404 });
      }

      // Create directly as 'approved' — admin has already decided to pay
      const request = await prisma.payoutRequest.create({
        data: {
          artistId,
          amount:        parseFloat(amount),
          currency:      'ZAR',
          bankAccountId: bankAccountId || null,
          status:        'approved',
          adminNotes:    notes || 'Admin-initiated payout',
        },
      });

      return NextResponse.json({ ok: true, request });
    }

    // ── Mark paid ─────────────────────────────────────────────────────────────
    if (action === 'mark_paid') {
      const { requestId, reference, notes } = body;
      if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

      const request = await prisma.payoutRequest.findUnique({
        where: { id: requestId },
        include: {
          artist: { select: { name: true, user: { select: { email: true } } } },
          bankAccount: { select: { bankName: true, maskedNumber: true } },
        },
      });
      if (!request) return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });
      if (!['approved', 'pending'].includes(request.status)) {
        return NextResponse.json({ error: `Cannot mark ${request.status} request as paid` }, { status: 409 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.payoutRequest.update({
          where: { id: requestId },
          data: {
            status:      'paid',
            processedAt: new Date(),
            adminNotes:  notes ? `${notes}${reference ? ` | Ref: ${reference}` : ''}` : (reference ? `Ref: ${reference}` : 'Marked paid by admin'),
          },
        });
        await tx.artistPayout.create({
          data: {
            artistId:    request.artistId,
            amount:      request.amount,
            currency:    request.currency,
            status:      'paid',
            method:      request.bankAccountId ? 'bank' : 'payfast',
            reference:   reference || '',
            notes:       notes || `PayoutRequest ${requestId}`,
            processedAt: new Date(),
          },
        });
      });

      return NextResponse.json({ ok: true });
    }

    // ── Approve ───────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const { requestId, notes } = body;
      if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });
      const req = await prisma.payoutRequest.findUnique({ where: { id: requestId } });
      if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (req.status !== 'pending') return NextResponse.json({ error: `Already ${req.status}` }, { status: 409 });
      await prisma.payoutRequest.update({
        where: { id: requestId },
        data:  { status: 'approved', adminNotes: notes || '' },
      });
      return NextResponse.json({ ok: true });
    }

    // ── Reject ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { requestId, notes } = body;
      if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });
      const req = await prisma.payoutRequest.findUnique({ where: { id: requestId } });
      if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!['pending', 'approved'].includes(req.status)) {
        return NextResponse.json({ error: `Cannot reject ${req.status} request` }, { status: 409 });
      }
      await prisma.payoutRequest.update({
        where: { id: requestId },
        data:  { status: 'rejected', adminNotes: notes || 'Rejected by admin' },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('[admin/finance] POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 503 });
  }
}
