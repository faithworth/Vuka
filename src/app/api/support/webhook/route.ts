import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import prisma from '@/lib/prisma';
import { sendSupportFanConfirmation, sendSupportArtistNotification } from '@/lib/emails';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata || {};
    if (!meta.supportTxnId) return NextResponse.json({ received: true });

    const txn = await prisma.supportTxn.update({
      where: { id: meta.supportTxnId },
      data: { status: 'confirmed', stripePaymentId: session.payment_intent as string },
      include: { artist: { include: { goals: { where: { isActive: true }, take: 1 } } } },
    });

    const activeGoal = txn.artist.goals[0];
    if (activeGoal) {
      await prisma.goal.update({
        where: { id: activeGoal.id },
        data: { currentAmount: { increment: txn.amount } },
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const goalPercent = activeGoal ? (activeGoal.currentAmount + txn.amount) / activeGoal.targetAmount * 100 : undefined;

    await Promise.all([
      sendSupportFanConfirmation({ to: txn.fanEmail, fanName: txn.fanName, artistName: txn.artist.name, amount: txn.amount, currency: txn.currency, tier: txn.tier, message: txn.message }),
      sendSupportArtistNotification({ to: meta.artistEmail, artistName: txn.artist.name, fanName: txn.fanName, amount: txn.amount, currency: txn.currency, tier: txn.tier, message: txn.message, goalTitle: activeGoal?.title, goalPercent }),
    ]);
  }

  return NextResponse.json({ received: true });
}
