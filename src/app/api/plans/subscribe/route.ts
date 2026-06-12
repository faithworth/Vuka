// src/app/api/plans/subscribe/route.ts
// Initiate a Paystack payment to activate Pro or Label plan.
// On charge.success → /api/plans/notify upgrades the artist.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { initializeTransaction, generateReference } from '@/lib/paystack';
import { PLANS } from '@/lib/plans';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { planSlug } = await req.json();
    const plan = PLANS.find(p => p.slug === planSlug);
    if (!plan || plan.priceZAR === 0) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    const artist = await prisma.artist.findUnique({ where: { id: user.artist.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.co.za';
    const reference = generateReference('PLAN');

    const result = await initializeTransaction({
      email:       user.email,
      amountZAR:   plan.priceZAR,
      reference,
      callbackUrl: `${appUrl}/dashboard?plan_activated=1`,
      metadata: {
        artistId: user.artist.id,
        planSlug,
        userEmail: user.email,
        type: 'plan_subscription',
      },
    });

    return NextResponse.json({ authorizationUrl: result.authorizationUrl, reference });
  } catch (err: any) {
    console.error('[plans/subscribe] error:', err?.message);
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
  }
}
