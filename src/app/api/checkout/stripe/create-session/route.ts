import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createCheckoutSession } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      itemType, itemId, licenseType,
      buyerEmail, buyerName, currency = 'ZAR',
    } = body;

    if (!itemType || !itemId || !buyerEmail || !buyerName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    let itemName = '';
    let amount = 0; // in cents
    let artworkUrl = '';
    let artistStripeAccountId: string | undefined;
    let artistEmail = '';

    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!beat || !beat.isActive) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      if (beat.isExclusive) return NextResponse.json({ error: 'Beat is already sold exclusively' }, { status: 400 });

      const priceMap: Record<string, number> = {
        basic: beat.basicPrice,
        premium: beat.premiumPrice,
        exclusive: beat.exclPrice,
      };
      const price = priceMap[licenseType || 'basic'] || beat.basicPrice;
      itemName = `${beat.title} (${licenseType || 'Basic'} License)`;
      amount = Math.round(price * 100);
      artworkUrl = beat.artworkUrl;
      artistStripeAccountId = beat.artist.stripeAccountId || undefined;
      artistEmail = beat.artist.user.email;
    } else if (itemType === 'release') {
      const release = await prisma.release.findUnique({
        where: { id: itemId },
        include: { artist: { include: { user: true } } },
      });
      if (!release || !release.isActive) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

      const price = parseFloat(body.customAmount) || release.price;
      if (release.minPrice > 0 && price < release.minPrice) {
        return NextResponse.json({ error: `Minimum price is ${release.minPrice}` }, { status: 400 });
      }
      itemName = release.title;
      amount = Math.round(price * 100);
      artworkUrl = release.artworkUrl;
      artistStripeAccountId = release.artist.stripeAccountId || undefined;
      artistEmail = release.artist.user.email;
    } else {
      return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const licenseId = `VK-${Date.now().toString(36).toUpperCase()}`;

    // ── FREE RELEASE: skip Stripe entirely ──
    if (amount === 0) {
      const purchase = await prisma.purchase.create({
        data: {
          buyerEmail,
          buyerName,
          itemType,
          beatId: itemType === 'beat' ? itemId : null,
          releaseId: itemType === 'release' ? itemId : null,
          amount: 0,
          currency,
          licenseType: licenseType || '',
          licenseId,
          status: 'completed',
        },
      });
      return NextResponse.json({ url: `${appUrl}/checkout/success?purchaseId=${purchase.id}` });
    }

    // Create pending purchase
    const purchase = await prisma.purchase.create({
      data: {
        buyerEmail,
        buyerName,
        itemType,
        beatId: itemType === 'beat' ? itemId : null,
        releaseId: itemType === 'release' ? itemId : null,
        amount: amount / 100,
        currency,
        licenseType: licenseType || '',
        licenseId,
        status: 'pending',
      },
    });

    const session = await createCheckoutSession({
      itemName,
      amount,
      currency: currency.toLowerCase(),
      metadata: {
        purchaseId: purchase.id,
        itemType,
        itemId,
        licenseType: licenseType || '',
        buyerEmail,
        buyerName,
        licenseId,
        artworkUrl,
        artistEmail,
      },
      artistStripeAccountId,
      successUrl: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}&purchaseId=${purchase.id}`,
      cancelUrl: `${appUrl}/${itemType}/${itemId}`,
      customerEmail: buyerEmail,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
