// src/app/api/creator/memberships/notify/route.ts
// PayFast ITN webhook — activates fan membership on confirmed payment.
// m_payment_id = membershipId (CreatorMembership.id, status: 'pending')

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validatePayFastITN, PAYFAST_IPS } from '@/lib/payfast';
import { platformFee as calcFee, artistNet as calcNet } from '@/lib/plans';

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') || '';

  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  if (!isSandbox && !PAYFAST_IPS.includes(clientIp)) {
    console.error('[memberships/notify] Blocked unknown IP:', clientIp);
    return new NextResponse('Forbidden', { status: 403 });
  }

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  if (!isSandbox && !validatePayFastITN(data, passphrase)) {
    console.error('[memberships/notify] ITN signature invalid');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  if (data.payment_status !== 'COMPLETE') {
    // Mark as failed if explicitly failed/cancelled
    if (data.m_payment_id && ['FAILED', 'CANCELLED'].includes(data.payment_status)) {
      await prisma.creatorMembership.updateMany({
        where: { id: data.m_payment_id, status: 'pending' },
        data:  { status: 'cancelled' },
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  const membershipId  = data.m_payment_id;
  const pfPaymentId   = data.pf_payment_id;
  const amountGross   = parseFloat(data.amount_gross ?? '0');
  const artistId      = data.custom_str3;
  const interval      = data.custom_str4 || 'monthly';

  try {
    // Idempotency — already processed
    const existing = await prisma.creatorMembership.findUnique({ where: { id: membershipId } });
    if (!existing) {
      console.warn('[memberships/notify] Membership not found:', membershipId);
      return NextResponse.json({ ok: true });
    }
    if (existing.status === 'active') {
      console.info('[memberships/notify] Already active — duplicate ITN ignored:', membershipId);
      return NextResponse.json({ ok: true });
    }

    // Set expiry based on billing interval
    const now = new Date();
    const expiresAt = new Date(now);
    if (interval === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Activate membership
    await prisma.creatorMembership.update({
      where: { id: membershipId },
      data:  { status: 'active', expiresAt },
    });

    // Get artist plan for fee calculation
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { planSlug: true, planExpiresAt: true },
    });

    const fee = calcFee(amountGross, artist?.planSlug, artist?.planExpiresAt);
    const net = calcNet(amountGross, artist?.planSlug, artist?.planExpiresAt);

    // Queue artist payout
    await prisma.artistPayout.create({
      data: {
        artistId,
        amount:    net,
        method:    'payfast',
        currency:  'ZAR',
        status:    'pending',
        reference: pfPaymentId,
        notes:     `Fan membership payment (fee: R${fee.toFixed(2)} kept by Vuka)`,
      },
    });

    // Record revenue for admin finance
    await prisma.purchase.create({
      data: {
        itemType:           'membership',
        artistId:           artistId,
        buyerEmail:         data.email_address || '',
        buyerName:          `${data.name_first || ''} ${data.name_last || ''}`.trim() || 'Fan',
        amount:             amountGross,
        currency:           'ZAR',
        platformFee:        fee,
        netAmount:          net,
        status:             'confirmed',
        payfastPfPaymentId: pfPaymentId,
        downloadToken:      `membership-${pfPaymentId}`,
      },
    });

    console.info('[memberships/notify] Membership activated:', membershipId);
  } catch (err) {
    console.error('[memberships/notify] Error:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}
