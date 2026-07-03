/**
 * GET /api/admin/finance?view=overview|purchases|tips|artist|payouts
 * Platform-wide financial data for the admin finance page.
 *
 * Purchase has NO artistId — artist is resolved through the
 * linked item (beat, release, video, sample, distributionRelease).
 * SupportTxn has NO platformFee/netAmount — computed per-artist plan rate.
 *
 * NOTE: All queries are sequential (no Promise.all) to stay within
 * the Prisma connection pool limit of 1 on serverless/hobby Postgres.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { platformFeeRate } from '@/lib/plans';

// Default rate used ONLY for aggregate tip calculations in the overview,
// where we don't load per-artist plan data. Per-artist views always use
// the real plan rate via platformFeeRate(artist.planSlug, artist.planExpiresAt).
const DEFAULT_TIP_RATE = 0.10;

// Helper: resolve the artist for a Purchase row by checking each item relation.
function resolveArtist(p: {
  artist?: any;
  beat?: { artistId: string; artist?: any } | null;
  release?: { artistId: string; artist?: any } | null;
  video?: { artistId: string; artist?: any } | null;
  sample?: { artistId: string; artist?: any } | null;
  distributionRelease?: { artistId: string; artist?: any } | null;
  merch?: { artistId: string; artist?: any } | null;
}) {
  return (
    p.artist ||
    p.beat?.artist ||
    p.release?.artist ||
    p.video?.artist ||
    p.sample?.artist ||
    p.distributionRelease?.artist ||
    p.merch?.artist ||
    null
  );
}

function resolveArtistId(p: {
  artistId?: string | null;
  beat?: { artistId: string } | null;
  release?: { artistId: string } | null;
  video?: { artistId: string } | null;
  sample?: { artistId: string } | null;
  distributionRelease?: { artistId: string } | null;
  merch?: { artistId: string } | null;
}) {
  return (
    p.artistId ||
    p.beat?.artistId ||
    p.release?.artistId ||
    p.video?.artistId ||
    p.sample?.artistId ||
    p.distributionRelease?.artistId ||
    p.merch?.artistId ||
    null
  );
}

// Common include for Purchase → artist via item.
// NOTE: every nested artist select includes planSlug/planExpiresAt — needed
// so aggregations can use each artist's REAL fee rate instead of a flat
// guess (see DEFAULT_TIP_RATE usage below, which is now only a fallback).
const ARTIST_SELECT = { id: true, name: true, photoUrl: true, planSlug: true, planExpiresAt: true } as const;

const PURCHASE_INCLUDE = {
  artist: {                           // direct FK — subscription, membership, marketplace
    select: ARTIST_SELECT,
  },
  beat: {
    select: {
      artistId: true, title: true,
      artist: { select: ARTIST_SELECT },
    },
  },
  release: {
    select: {
      artistId: true, title: true,
      artist: { select: ARTIST_SELECT },
    },
  },
  video: {
    select: {
      artistId: true, title: true,
      artist: { select: ARTIST_SELECT },
    },
  },
  sample: {
    select: {
      artistId: true, title: true,
      artist: { select: ARTIST_SELECT },
    },
  },
  distributionRelease: {
    select: {
      artistId: true, title: true,
      artist: { select: ARTIST_SELECT },
    },
  },
  merch: {
    select: {
      artistId: true, title: true,
      artist: { select: ARTIST_SELECT },
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
      const now = new Date();
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Sequential queries — avoids connection pool exhaustion (limit: 1)
      const allPurchases = await prisma.purchase.findMany({
        where: { status: 'confirmed' },
        select: { amount: true, platformFee: true, netAmount: true },
      });
      const monthPurchases = await prisma.purchase.findMany({
        where: { status: 'confirmed', createdAt: { gte: d30 } },
        select: { amount: true, platformFee: true, netAmount: true },
      });
      const allTips = await prisma.supportTxn.findMany({
        where: { status: 'confirmed' },
        select: { amount: true },
      });
      const monthTips = await prisma.supportTxn.findMany({
        where: { status: 'confirmed', createdAt: { gte: d30 } },
        select: { amount: true },
      });
      const paidPayouts = await prisma.payoutRequest.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true },
        _count: true,
      });
      const pendingPayouts = await prisma.payoutRequest.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
        _count: true,
      });
      // Pro/Label subscription payments — a real revenue stream that was
      // previously completely absent from Finance (only sales + tips were
      // counted). "successful" here covers both still-active and since-
      // cancelled/expired subscriptions; the artist paid Vuka Music
      // regardless of whether the plan later lapsed.
      const allPlanPayments = await prisma.artistPlanSubscription.findMany({
        where: { status: { in: ['active', 'cancelled', 'expired'] } },
        select: { amount: true },
      });
      const planRevenueTotal = allPlanPayments.reduce((a, s) => a + (s.amount || 0), 0);

      const sumPurchases = allPurchases.reduce(
        (a, p) => ({
          gross: a.gross + (p.amount || 0),
          platform: a.platform + (p.platformFee || 0),
          net: a.net + (p.netAmount || 0),
        }),
        { gross: 0, platform: 0, net: 0 },
      );
      const sumTips = allTips.reduce((a, t) => a + (t.amount || 0), 0);
      const tipPlatform = sumTips * DEFAULT_TIP_RATE;
      const tipNet = sumTips * (1 - DEFAULT_TIP_RATE);

      const sumMonthPurchases = monthPurchases.reduce(
        (a, p) => ({
          gross: a.gross + (p.amount || 0),
          platform: a.platform + (p.platformFee || 0),
        }),
        { gross: 0, platform: 0 },
      );
      const sumMonthTips = monthTips.reduce((a, t) => a + (t.amount || 0), 0);

      const salesByTypeRows = await prisma.purchase.groupBy({
        by: ['itemType'],
        where: { status: 'confirmed' },
        _sum: { amount: true, platformFee: true },
        _count: true,
      });

      const topPurchases = await prisma.purchase.findMany({
        where: { status: 'confirmed' },
        select: {
          amount: true,
          platformFee: true,
          netAmount: true,
          artistId: true,
          artist:  { select: ARTIST_SELECT },
          beat:    { select: { artistId: true, artist: { select: ARTIST_SELECT } } },
          release: { select: { artistId: true, artist: { select: ARTIST_SELECT } } },
          video:   { select: { artistId: true, artist: { select: ARTIST_SELECT } } },
          sample:  { select: { artistId: true, artist: { select: ARTIST_SELECT } } },
          distributionRelease: { select: { artistId: true, artist: { select: ARTIST_SELECT } } },
          merch:   { select: { artistId: true, artist: { select: ARTIST_SELECT } } },
        },
      });

      const topTips = await prisma.supportTxn.findMany({
        where: { status: 'confirmed' },
        select: { artistId: true, amount: true, artist: { select: ARTIST_SELECT } },
      });

      const paidPerArtist = await prisma.payoutRequest.groupBy({
        by: ['artistId'],
        where: { status: 'paid' },
        _sum: { amount: true },
      });
      const paidMap: Record<string, number> = {};
      for (const r of paidPerArtist) paidMap[r.artistId] = r._sum.amount || 0;

      const pendingPerArtist = await prisma.payoutRequest.groupBy({
        by: ['artistId'],
        where: { status: { in: ['pending', 'approved'] } },
        _sum: { amount: true },
      });
      const pendingMap: Record<string, number> = {};
      for (const r of pendingPerArtist) pendingMap[r.artistId] = r._sum.amount || 0;

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
        // Use this artist's REAL plan rate, not the flat 10% default —
        // previously every artist's tips were fee-adjusted at 10% here
        // regardless of actual plan, which disagreed with the per-artist
        // detail view (which always used the real rate) and produced
        // mismatched "artist owes" / balance figures platform-wide.
        const rate = artist ? platformFeeRate(artist.planSlug, artist.planExpiresAt) : DEFAULT_TIP_RATE;
        artistMap[artistId].grossTips   += t.amount || 0;
        artistMap[artistId].artistOwes  += (t.amount || 0) * (1 - rate);
        artistMap[artistId].platformCut += (t.amount || 0) * rate;
        artistMap[artistId].tipsCount   += 1;
      }

      for (const id of Object.keys(artistMap)) {
        artistMap[id].payoutsTotal    = paidMap[id] || 0;
        artistMap[id].pendingRequests = pendingMap[id] || 0;
        if (!artistMap[id].defaultBank) artistMap[id].defaultBank = bankMap[id] || null;
      }

      const topArtists = Object.entries(artistMap)
        .map(([artistId, data]) => ({ artistId, ...data }))
        .sort((a, b) => (b.grossSales + b.grossTips) - (a.grossSales + a.grossTips))
        .slice(0, 20);

      return NextResponse.json({
        revenue: {
          gross:           sumPurchases.gross + sumTips,
          platformCut:     sumPurchases.platform + tipPlatform,
          artistTotal:     sumPurchases.net + tipNet,
          salesCount:      allPurchases.length,
          tipsCount:       allTips.length,
          monthGross:      sumMonthPurchases.gross + sumMonthTips,
          monthPlatform:   sumMonthPurchases.platform + sumMonthTips * DEFAULT_TIP_RATE,
          monthSalesCount: monthPurchases.length,
          monthTipsCount:  monthTips.length,
          // Plan (Pro/Label) subscriptions — 100% platform revenue, kept
          // separate from sales/tips because artists don't get a cut of it.
          planRevenue:       planRevenueTotal,
          planPaymentsCount: allPlanPayments.length,
          // What Vuka Music has actually earned in total: its cut of
          // sales+tips, PLUS every plan subscription payment.
          platformTotalRevenue: sumPurchases.platform + tipPlatform + planRevenueTotal,
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

      const purchases = await prisma.purchase.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      });
      const total = await prisma.purchase.count({ where });

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

      const tips = await prisma.supportTxn.findMany({
        where: { status: 'confirmed' },
        include: { artist: { select: { id: true, name: true, photoUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      });
      const total = await prisma.supportTxn.count({ where: { status: 'confirmed' } });

      const rows = tips.map((t) => ({
        ...t,
        platformFee: t.amount * DEFAULT_TIP_RATE,
        netAmount:   t.amount * (1 - DEFAULT_TIP_RATE),
      }));

      return NextResponse.json({ tips: rows, total, page, pages: Math.ceil(total / limit) });
    }

    // ─── ARTIST DETAIL ────────────────────────────────────────────────────────
    if (view === 'artist') {
      const artistId = searchParams.get('id');
      if (!artistId) return NextResponse.json({ error: 'id required' }, { status: 400 });

      const artist = await prisma.artist.findUnique({
        where:  { id: artistId },
        select: { id: true, name: true, photoUrl: true, slug: true, planSlug: true, planExpiresAt: true, lifetimeGrossSales: true },
      });
      if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

      // Use the artist's real plan rate for tips — accurate per-artist view
      const artistTipRate = platformFeeRate(
        artist.planSlug,
        artist.planExpiresAt,
        (artist as any).lifetimeGrossSales ?? 0,
      );

      // Use `is:` for nullable relation filters (Prisma requirement)
      const rawPurchases = await prisma.purchase.findMany({
        where: {
          status: 'confirmed',
          OR: [
            { artistId },                              // subscription, membership, marketplace
            { beat:                { is: { artistId } } },
            { release:             { is: { artistId } } },
            { video:               { is: { artistId } } },
            { sample:              { is: { artistId } } },
            { distributionRelease: { is: { artistId } } },
            { merch:               { is: { artistId } } },
          ],
        },
        include: PURCHASE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      const tips = await prisma.supportTxn.findMany({
        where:   { artistId, status: 'confirmed' },
        include: { artist: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      const payoutRequests = await prisma.payoutRequest.findMany({
        where:   { artistId },
        include: {
          bankAccount: {
            select: { id: true, bankName: true, accountHolder: true, maskedNumber: true, branchCode: true, accountType: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      const artistPayouts = await prisma.artistPayout.findMany({
        where:   { artistId },
        orderBy: { createdAt: 'desc' },
      });
      const bankAccounts = await prisma.artistBankAccount.findMany({
        where:   { artistId },
        select: {
          id: true, bankName: true, accountHolder: true,
          maskedNumber: true, branchCode: true, accountType: true, isDefault: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      // Plan (Pro/Label) subscription payments — previously invisible in
      // admin finance entirely, even though these are real payments the
      // artist made to Vuka Music (separate revenue stream from sales/tips).
      const planPayments = await prisma.artistPlanSubscription.findMany({
        where:   { artistId },
        orderBy: { createdAt: 'desc' },
      });
      const planRevenueTotal = planPayments.reduce((a, s) => a + (s.amount || 0), 0);

      const purchases = rawPurchases.map((p) => ({
        ...p,
        artist: resolveArtist(p as any),
      }));

      const tipsWithFees = tips.map((t) => ({
        ...t,
        platformFee: t.amount * artistTipRate,
        netAmount:   t.amount * (1 - artistTipRate),
      }));

      const grossSales    = purchases.reduce((a, p) => a + (p.amount || 0), 0);
      const grossTips     = tips.reduce((a, t) => a + (t.amount || 0), 0);
      const salesPlatform = purchases.reduce((a, p) => a + (p.platformFee || 0), 0);
      const tipsPlatform  = grossTips * artistTipRate;
      const totalPlatform = salesPlatform + tipsPlatform;
      const salesNet      = purchases.reduce((a, p) => a + (p.netAmount || 0), 0);
      const tipsNet       = grossTips * (1 - artistTipRate);
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
          planRevenueTotal,   // total the artist has paid Vuka Music for Pro/Label plans
          planPaymentsCount:  planPayments.length,
        },
        purchases,
        tips: tipsWithFees,
        payoutRequests,
        payoutsLedger: artistPayouts,
        bankAccounts,
        planPayments,         // full Pro/Label subscription payment history
      });
    }

    // ─── PAYOUTS ──────────────────────────────────────────────────────────────
    if (view === 'payouts') {
      const status = searchParams.get('status') || 'all';
      const page   = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const limit  = 50;

      const where: any = status === 'all' ? {} : { status };

      const requests = await prisma.payoutRequest.findMany({
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
      });
      const total      = await prisma.payoutRequest.count({ where });
      const pendingAgg = await prisma.payoutRequest.aggregate({ where: { status: 'pending' }, _sum: { amount: true }, _count: true });
      const paidAgg    = await prisma.payoutRequest.aggregate({ where: { status: 'paid' },    _sum: { amount: true }, _count: true });

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
 *   { action: 'mark_paid', requestId, reference, notes }
 *   { action: 'approve', requestId, notes }
 *   { action: 'reject', requestId, notes }
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    // ── Create payout ─────────────────────────────────────────────────────────
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

        // Settle the artist's per-sale pending ledger entries against this
        // payout (oldest first) instead of inserting a brand-new lump-sum
        // row. Previously every payout added a fresh "paid" row on top of
        // the untouched per-sale "pending" rows created at sale time — so
        // "pending" balance never shrank after a payout and looked
        // permanently ≈ equal to lifetime earnings ("double artist net").
        const pendingEntries = await tx.artistPayout.findMany({
          where: { artistId: request.artistId, status: 'pending' },
          orderBy: { createdAt: 'asc' },
        });

        let remaining = request.amount;
        for (const entry of pendingEntries) {
          if (remaining <= 0) break;
          await tx.artistPayout.update({
            where: { id: entry.id },
            data: {
              status:      'paid',
              reference:   reference || entry.reference,
              notes:       `${entry.notes} — settled by PayoutRequest ${requestId}`,
              processedAt: new Date(),
            },
          });
          remaining -= entry.amount;
        }

        // Any remainder (earnings from tips, subscriptions, memberships, or
        // marketplace sales — none of which get a per-sale ArtistPayout row
        // today) is recorded as one bridging entry so totals still
        // reconcile, without duplicating the sales settled above.
        if (remaining > 0.01) {
          await tx.artistPayout.create({
            data: {
              artistId:    request.artistId,
              amount:      Math.round(remaining * 100) / 100,
              currency:    request.currency,
              status:      'paid',
              method:      request.bankAccountId ? 'bank' : 'paystack',
              reference:   reference || '',
              notes:       notes || `PayoutRequest ${requestId} (tips/subscription/membership earnings)`,
              processedAt: new Date(),
            },
          });
        }
      });

      return NextResponse.json({ ok: true });
    }

    // ── Approve ───────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const { requestId, notes } = body;
      if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });
      const r = await prisma.payoutRequest.findUnique({ where: { id: requestId } });
      if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (r.status !== 'pending') return NextResponse.json({ error: `Already ${r.status}` }, { status: 409 });
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
      const r = await prisma.payoutRequest.findUnique({ where: { id: requestId } });
      if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!['pending', 'approved'].includes(r.status)) {
        return NextResponse.json({ error: `Cannot reject ${r.status} request` }, { status: 409 });
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
