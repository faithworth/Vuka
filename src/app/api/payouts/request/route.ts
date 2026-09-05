// ============================================================
// src/app/api/payouts/request/route.ts (Phase 9)
// Artist requests a payout — now sends sendPayoutRequested email
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { requestPayout, retryPayoutRequest } from '@/lib/payouts';
import prisma from '@/lib/prisma';
import { schemas, validationError } from '@/lib/validation';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { sendPayoutRequested } from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

// GET — list artist's payout requests
export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requests = await prisma.payoutRequest.findMany({
      where: { artistId: user.artist.id },
      include: {
        bankAccount: {
          select: {
            bankName: true,
            accountHolder: true,
            maskedNumber: true,
            branchCode: true,
            accountType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[payouts/request] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — disabled. Payouts are no longer self-serve: Vuka pays out
// automatically every Monday to every artist with a clearable balance
// above the R50 minimum and a verified bank account on file, the way a
// label pays its roster on schedule rather than on demand. See
// src/lib/royalty-run.ts and the `royalty_run` cron entry in vercel.json.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Payout requests are automatic now. Vuka pays out to eligible artists every Monday — no action needed once your balance clears R50 and you have a verified bank account on file.',
    },
    { status: 410 },
  );
}

// PATCH — retry a failed payout request
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

    // Verify ownership
    const existing = await prisma.payoutRequest.findFirst({
      where: { id: requestId, artistId: user.artist.id },
    });
    if (!existing) return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });

    const result = await retryPayoutRequest(requestId);
    return NextResponse.json({ result });
  } catch (err: any) {
    console.error('[payouts/request] PATCH error:', err?.message);
    const code = err?.message?.includes('Max retry') ? 409 : 503;
    return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: code });
  }
}
