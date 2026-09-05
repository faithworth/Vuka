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

// POST — disabled. Payouts are no longer self-serve or label-triggered:
// every roster artist is paid automatically every Monday once their
// balance clears R50 and they have a verified bank account on file. See
// src/lib/royalty-run.ts and the `royalty_run` cron entry in vercel.json.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Bulk payout requests are automatic now. Every roster artist with a clearable balance and a verified bank account is paid every Monday — no action needed.',
    },
    { status: 410 },
  );
}
