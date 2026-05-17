// PayFast ITN webhook for support/donation transactions
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validatePayFastITN, PAYFAST_IPS } from '@/lib/payfast';
import { sendSupportFanConfirmation, sendSupportArtistNotification } from '@/lib/emails';

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') || '';

  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  if (!isSandbox && !PAYFAST_IPS.includes(clientIp)) {
    console.error('PayFast support ITN from unknown IP:', clientIp);
    return new NextResponse('Forbidden', { status: 403 });
  }

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  if (!isSandbox && !validatePayFastITN(data, passphrase)) {
    console.error('PayFast support ITN signature invalid');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  if (data.payment_status !== 'COMPLETE') {
    return NextResponse.json({ ok: true });
  }

  const txnId = data.m_payment_id;
  const pfPaymentId = data.pf_payment_id;

  try {
    const txn = await prisma.supportTxn.update({
      where: { id: txnId },
      data: { status: 'confirmed', stripePaymentId: pfPaymentId },
      include: {
        artist: {
          include: {
            user: true,
            goals: { where: { isActive: true }, take: 1 },
          },
        },
      },
    });

    // Update goal if active
    const activeGoal = txn.artist.goals[0];
    if (activeGoal) {
      await prisma.goal.update({
        where: { id: activeGoal.id },
        data: { currentAmount: { increment: txn.amount } },
      });
    }

    const goalPercent = activeGoal
      ? ((activeGoal.currentAmount + txn.amount) / activeGoal.targetAmount) * 100
      : undefined;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    await Promise.all([
      sendSupportFanConfirmation({
        to: txn.fanEmail,
        fanName: txn.fanName,
        artistName: txn.artist.name,
        amount: txn.amount,
        currency: txn.currency,
        tier: txn.tier,
        message: txn.message || undefined,
      }),
      sendSupportArtistNotification({
        to: txn.artist.user.email,
        artistName: txn.artist.name,
        fanName: txn.fanName,
        amount: txn.amount,
        currency: txn.currency,
        tier: txn.tier,
        message: txn.message || undefined,
        goalTitle: activeGoal?.title,
        goalPercent,
      }),
    ]);
  } catch (err) {
    console.error('Support PayFast notify error:', err);
  }

  return NextResponse.json({ ok: true });
}
