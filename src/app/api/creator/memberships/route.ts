// ============================================================
// src/app/api/creator/memberships/route.ts
// Fan membership: checkout (PayFast), cancel, list active memberships
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildPayFastForm } from '@/lib/payfast';
import { cancelMembership } from '@/lib/creator';

// GET — list caller's active memberships (fan view)
export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const memberships = await prisma.creatorMembership.findMany({
      where: { userId: user.id, status: 'active' },
      include: {
        tier: true,
        artist: { select: { id: true, name: true, slug: true, photoUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ memberships });
  } catch (err: any) {
    console.error('[creator/memberships] GET error:', err?.message ?? err);
    return NextResponse.json({ memberships: [] }, { status: 200 });
  }
}

// POST — initiate PayFast checkout for a membership tier
// On ITN confirmation → /api/creator/memberships/notify activates access
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { tierId, artistId, billingInterval } = await req.json();
    if (!tierId)   return NextResponse.json({ error: 'tierId required' }, { status: 400 });
    if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });

    const tier = await prisma.creatorSubscriptionTier.findUnique({
      where: { id: tierId },
      include: { artist: { include: { user: true } } },
    });
    if (!tier || !tier.isActive) return NextResponse.json({ error: 'Tier not found or inactive' }, { status: 404 });
    if (tier.artistId !== artistId) return NextResponse.json({ error: 'Tier/artist mismatch' }, { status: 400 });
    if (tier.artist.userId === user.id) return NextResponse.json({ error: 'Cannot subscribe to your own tier' }, { status: 400 });

    // Check for existing active membership
    const existing = await prisma.creatorMembership.findFirst({
      where: { userId: user.id, tierId, status: 'active' },
    });
    if (existing) return NextResponse.json({ error: 'Already subscribed to this tier' }, { status: 409 });

    const appUrl      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const isSandbox   = process.env.PAYFAST_SANDBOX === 'true';
    const merchantId  = isSandbox ? (process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10000100') : process.env.PAYFAST_MERCHANT_ID!;
    const merchantKey = isSandbox ? (process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '46f0cd694581a') : process.env.PAYFAST_MERCHANT_KEY!;
    const passphrase  = process.env.PAYFAST_PASSPHRASE || '';

    if (!merchantId || !merchantKey) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 });
    }

    // Create a pending membership record — activated by ITN
    const membership = await prisma.creatorMembership.create({
      data: {
        userId:          user.id,
        tierId,
        artistId:        tier.artistId,
        status:          'pending',
        billingInterval: billingInterval || 'monthly',
        expiresAt:       new Date(), // placeholder — set properly in notify
      },
    });

    const interval = billingInterval || 'monthly';
    const amount   = interval === 'yearly' ? tier.price * 12 * 0.9 : tier.price; // 10% yearly discount

    const formData = buildPayFastForm(
      {
        merchant_id:   merchantId,
        merchant_key:  merchantKey,
        return_url:    `${appUrl}/artist/${tier.artist.slug}?membership=success`,
        cancel_url:    `${appUrl}/artist/${tier.artist.slug}`,
        notify_url:    `${appUrl}/api/creator/memberships/notify`,
        name_first:    user.name?.split(' ')[0] || user.email.split('@')[0],
        name_last:     user.name?.split(' ').slice(1).join(' ') || '',
        email_address: user.email,
        m_payment_id:  membership.id,
        amount:        Number(amount).toFixed(2),
        item_name:     `${tier.artist.name} — ${tier.name} membership`.substring(0, 100),
        custom_str1:   membership.id,   // membershipId
        custom_str2:   'membership',
        custom_str3:   tier.artistId,
        custom_str4:   interval,
        custom_str5:   user.id,
      },
      passphrase,
    );

    return NextResponse.json({
      formData,
      actionUrl: isSandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process',
      method: 'payfast',
    }, { status: 201 });
  } catch (err: any) {
    console.error('[creator/memberships] POST error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to initiate checkout' }, { status: 503 });
  }
}

// DELETE — cancel membership
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tierId = searchParams.get('tierId');
    if (!tierId) return NextResponse.json({ error: 'tierId required' }, { status: 400 });

    const membership = await prisma.creatorMembership.findFirst({
      where: { userId: user.id, tierId },
    });
    if (!membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

    await cancelMembership(user.id, tierId);
    return NextResponse.json({ ok: true, message: 'Membership cancelled. Access continues until end of billing period.' });
  } catch (err: any) {
    console.error('[creator/memberships] DELETE error:', err?.message);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 503 });
  }
}
