import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { buildPayFastForm } from '@/lib/payfast';

export async function POST(req: NextRequest) {
  try {
    const { artistSlug, amount, message, fanName, fanEmail, isPublic, tier } = await req.json();
    if (!artistSlug || !amount || !fanEmail || !fanName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const artist = await prisma.artist.findUnique({
      where: { slug: artistSlug },
      include: { user: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const txn = await prisma.supportTxn.create({
      data: {
        fanEmail,
        fanName,
        artistId: artist.id,
        amount,
        currency: artist.currency || 'ZAR',
        message: message || '',
        tier: tier || 'Listener',
        isPublic: isPublic !== false,
        status: 'pending',
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Prefer Stripe if configured
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: artist.currency?.toLowerCase() || 'zar',
              product_data: { name: `Support ${artist.name}` },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          }],
          metadata: {
            supportTxnId: txn.id,
            fanEmail,
            fanName,
            artistId: artist.id,
            artistEmail: artist.user.email,
            tier: tier || 'Listener',
            message: message || '',
          },
          success_url: `${appUrl}/support/${artistSlug}?success=1&txnId=${txn.id}`,
          cancel_url: `${appUrl}/support/${artistSlug}`,
          customer_email: fanEmail,
          ...(artist.stripeAccountId && {
            payment_intent_data: { transfer_data: { destination: artist.stripeAccountId } },
          }),
        });
        return NextResponse.json({ url: session.url, method: 'stripe' });
      } catch (stripeErr) {
        console.error('Stripe support session error:', stripeErr);
        // Fall through to PayFast
      }
    }

    // PayFast fallback
    const isSandbox = process.env.PAYFAST_SANDBOX === 'true';
    const merchantId = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10000100')
      : (artist.payfastMerchant || process.env.PAYFAST_MERCHANT_ID);
    const merchantKey = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '46f0cd694581a')
      : process.env.PAYFAST_MERCHANT_KEY;

    if (merchantId && merchantKey) {
      const passphrase = isSandbox
        ? (process.env.PAYFAST_SANDBOX_PASSPHRASE || '')
        : (process.env.PAYFAST_PASSPHRASE || '');
      const formData = buildPayFastForm(
        {
          merchant_id: merchantId,
          merchant_key: merchantKey,
          return_url: `${appUrl}/support/${artistSlug}?success=1&txnId=${txn.id}`,
          cancel_url: `${appUrl}/support/${artistSlug}`,
          notify_url: `${appUrl}/api/support/payfast-notify`,
          name_first: fanName.split(' ')[0] || fanName,
          email_address: fanEmail,
          m_payment_id: txn.id,
          amount: Number(amount).toFixed(2),
          item_name: `Support ${artist.name}`.substring(0, 100),
          custom_str1: artist.id,
          custom_str2: 'support',
          custom_str3: tier || 'Listener',
        },
        passphrase
      );
      return NextResponse.json({
        formData,
        actionUrl: isSandbox
          ? 'https://sandbox.payfast.co.za/eng/process'
          : 'https://www.payfast.co.za/eng/process',
        method: 'payfast',
      });
    }

    return NextResponse.json({ error: 'No payment gateway configured. Set STRIPE_SECRET_KEY or PAYFAST_MERCHANT_ID in your environment.' }, { status: 500 });
  } catch (err) {
    console.error('Support session error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
