import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { artistSlug, amount, message, fanName, fanEmail, isPublic, tier } = await req.json();
    if (!artistSlug || !amount || !fanEmail || !fanName) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const artist = await prisma.artist.findUnique({ where: { slug: artistSlug }, include: { user: true } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const txn = await prisma.supportTxn.create({
      data: {
        fanEmail,
        fanName,
        artistId: artist.id,
        amount,
        currency: 'ZAR',
        message: message || '',
        tier: tier || 'Listener',
        isPublic: isPublic !== false,
        status: 'pending',
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: { currency: 'zar', product_data: { name: `Support ${artist.name}` }, unit_amount: Math.round(amount * 100) },
        quantity: 1,
      }],
      metadata: { supportTxnId: txn.id, fanEmail, fanName, artistId: artist.id, artistEmail: artist.user.email, tier: tier || 'Listener', message: message || '' },
      success_url: `${appUrl}/success?supportId=${txn.id}`,
      cancel_url: `${appUrl}/support/${artistSlug}`,
      customer_email: fanEmail,
      ...(artist.stripeAccountId && {
        payment_intent_data: { transfer_data: { destination: artist.stripeAccountId } },
      }),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Support session error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
