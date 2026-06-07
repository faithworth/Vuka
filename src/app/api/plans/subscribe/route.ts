// ============================================================
// src/app/api/plans/subscribe/route.ts
// Initiate a PayFast payment to activate Pro or Label plan.
// On PayFast ITN confirmation → /api/plans/notify upgrades the artist.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { buildPayFastForm } from '@/lib/payfast';
import { PLANS } from '@/lib/plans';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { planSlug } = await req.json();
    const plan = PLANS.find(p => p.slug === planSlug);

    if (!plan || plan.priceZAR === 0) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Already on this plan and not expired
    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { planSlug: true, planExpiresAt: true, id: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const isSandbox = process.env.PAYFAST_SANDBOX === 'true';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.co.za';

    const merchantId  = isSandbox ? (process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10000100') : process.env.PAYFAST_MERCHANT_ID!;
    const merchantKey = isSandbox ? (process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '46f0cd694581a') : process.env.PAYFAST_MERCHANT_KEY!;
    const passphrase  = process.env.PAYFAST_PASSPHRASE || '';

    // Unique payment reference
    const paymentRef = `PLAN-${user.artist.id}-${planSlug}-${Date.now()}`;

    const formFields = buildPayFastForm(
      {
        merchant_id:   merchantId,
        merchant_key:  merchantKey,
        return_url:    `${appUrl}/dashboard?plan_activated=1`,
        cancel_url:    `${appUrl}/dashboard/settings?plan_cancelled=1`,
        notify_url:    `${appUrl}/api/plans/notify`,
        name_first:    user.name?.split(' ')[0] || 'Artist',
        name_last:     user.name?.split(' ').slice(1).join(' ') || '',
        email_address: user.email,
        m_payment_id:  paymentRef,
        amount:        plan.priceZAR.toFixed(2),
        item_name:     `Vuka ${plan.name} Plan - Monthly`,
        item_description: `Monthly subscription to Vuka ${plan.name} plan. ${plan.artistSharePct}% artist earnings share.`,
        custom_str1:   user.artist.id,  // artistId
        custom_str2:   planSlug,         // plan to activate
        custom_str3:   user.email,       // for verification
      },
      passphrase,
    );

    const pfHost = isSandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
    const payfastUrl = `https://${pfHost}/eng/process`;

    return NextResponse.json({ payfastUrl, formFields });
  } catch (err: any) {
    console.error('[plans/subscribe] error:', err?.message);
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
  }
}
