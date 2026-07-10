// src/app/api/label/payouts/bulk/route.ts
// Label-plan exclusive: view available balances across the whole roster
// and trigger payout requests for multiple artists in one action.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePlanAtLeast } from '@/lib/planGates';
import { requestPayout } from '@/lib/payouts';

// GET — list roster artists with their current available balance and
// default bank account, so the label owner can see who's payable before
// triggering a bulk request.
export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requirePlanAtLeast(user.artist.id, 'label');
  if (!gate.ok) return gate.response;

  const label = await prisma.label.findUnique({
    where: { ownerId: user.id },
    include: {
      roster: {
        where: { status: 'active' },
        include: {
          artist: {
            select: {
              id: true, name: true, slug: true, photoUrl: true,
              bankAccounts: { where: { isDefault: true }, select: { id: true, bankName: true, maskedNumber: true } },
            },
          },
        },
      },
    },
  });
  if (!label) return NextResponse.json({ error: 'No label found' }, { status: 404 });

  const rows = await Promise.all(label.roster.map(async (r) => {
    const artistId = r.artist.id;
    const [pendingLedger, alreadyRequested] = await Promise.all([
      prisma.artistPayout.aggregate({ where: { artistId, status: 'pending' }, _sum: { amount: true } }),
      prisma.payoutRequest.aggregate({ where: { artistId, status: { in: ['pending', 'approved'] } }, _sum: { amount: true } }),
    ]);
    const available = (pendingLedger._sum.amount ?? 0) - (alreadyRequested._sum.amount ?? 0);
    const defaultBank = r.artist.bankAccounts[0] ?? null;
    return {
      artistId,
      name: r.artist.name,
      slug: r.artist.slug,
      photoUrl: r.artist.photoUrl,
      available: Math.max(0, Math.round(available * 100) / 100),
      bankAccountId: defaultBank?.id ?? null,
      bankLabel: defaultBank ? `${defaultBank.bankName} •••${defaultBank.maskedNumber}` : null,
      // R50 minimum payout threshold — same floor as the individual payout flow.
      payable: available >= 50 && !!defaultBank,
    };
  }));

  return NextResponse.json({ artists: rows });
}

// POST — trigger payout requests for a set of artists.
// Body: { artistIds: string[] } — requests each artist's full available
// balance to their default bank account. Artists without a default bank
// account or below the R50 minimum are silently skipped and reported back,
// not treated as a hard failure of the whole batch.
export async function POST(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requirePlanAtLeast(user.artist.id, 'label');
  if (!gate.ok) return gate.response;

  const { artistIds } = await req.json();
  if (!Array.isArray(artistIds) || artistIds.length === 0) {
    return NextResponse.json({ error: 'artistIds array required' }, { status: 400 });
  }

  const label = await prisma.label.findUnique({
    where: { ownerId: user.id },
    include: { roster: { where: { status: 'active' } } },
  });
  if (!label) return NextResponse.json({ error: 'No label found' }, { status: 404 });

  // Only allow requesting payouts for artists actually on this label's
  // active roster — prevents a label owner from requesting payouts for
  // arbitrary artistIds outside their own roster.
  const rosterIds = new Set(label.roster.map(r => r.artistId));
  const validIds = artistIds.filter((id: string) => rosterIds.has(id));

  const results: { artistId: string; ok: boolean; amount?: number; error?: string }[] = [];

  for (const artistId of validIds) {
    try {
      const defaultBank = await prisma.artistBankAccount.findFirst({ where: { artistId, isDefault: true } });
      if (!defaultBank) {
        results.push({ artistId, ok: false, error: 'No default bank account on file' });
        continue;
      }

      const [pendingLedger, alreadyRequested] = await Promise.all([
        prisma.artistPayout.aggregate({ where: { artistId, status: 'pending' }, _sum: { amount: true } }),
        prisma.payoutRequest.aggregate({ where: { artistId, status: { in: ['pending', 'approved'] } }, _sum: { amount: true } }),
      ]);
      const available = Math.round(((pendingLedger._sum.amount ?? 0) - (alreadyRequested._sum.amount ?? 0)) * 100) / 100;

      if (available < 50) {
        results.push({ artistId, ok: false, error: `Below R50 minimum (available: R${available.toFixed(2)})` });
        continue;
      }

      await requestPayout({
        artistId,
        amount: available,
        currency: 'ZAR',
        bankAccountId: defaultBank.id,
        bankName: defaultBank.bankName,
        accountHolder: defaultBank.accountHolder,
      });
      results.push({ artistId, ok: true, amount: available });
    } catch (err: any) {
      results.push({ artistId, ok: false, error: err?.message || 'Payout request failed' });
    }
  }

  const skipped = artistIds.filter((id: string) => !rosterIds.has(id));
  return NextResponse.json({
    ok: true,
    results,
    skippedNotOnRoster: skipped,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
  });
}
