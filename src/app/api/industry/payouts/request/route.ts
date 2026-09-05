// ============================================================
// src/app/api/industry/payouts/request/route.ts
// Mirrors src/app/api/payouts/request/route.ts (artist) for industry users.
// Industry user requests a payout — sends sendPayoutRequested email
// (shared template, generic "name" field works for both artists & industry).
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireIndustry } from '@/lib/auth';
import { requestIndustryPayout, retryIndustryPayoutRequest } from '@/lib/industry-payouts';
import prisma from '@/lib/prisma';
import { schemas, validationError } from '@/lib/validation';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { sendPayoutRequested } from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

// GET — list industry user's payout requests
export async function GET() {
  try {
    const user = await requireIndustry();
    if (!user?.industryUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requests = await prisma.industryPayoutRequest.findMany({
      where: { industryUserId: user.industryUser.id },
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
    console.error('[industry/payouts/request] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — disabled. Payouts are no longer self-serve: Vuka pays out
// automatically every Monday to every industry user with a clearable
// balance above the R50 minimum and a verified bank account on file. See
// src/lib/royalty-run.ts and the `royalty_run` cron entry in vercel.json.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Payout requests are automatic now. Vuka pays out to eligible accounts every Monday — no action needed once your balance clears R50 and you have a verified bank account on file.',
    },
    { status: 410 },
  );
}

// PATCH — retry a rejected payout request
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireIndustry();
    if (!user?.industryUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

    // Verify ownership
    const existing = await prisma.industryPayoutRequest.findFirst({
      where: { id: requestId, industryUserId: user.industryUser.id },
    });
    if (!existing) return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });

    const result = await retryIndustryPayoutRequest(requestId);
    return NextResponse.json({ result });
  } catch (err: any) {
    console.error('[industry/payouts/request] PATCH error:', err?.message);
    const code = err?.message?.includes('Only rejected') ? 409 : 503;
    return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: code });
  }
}
