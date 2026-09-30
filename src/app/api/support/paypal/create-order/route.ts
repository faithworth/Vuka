export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import paypal, { getApproveUrl, isPayPalConfigured } from '@/lib/paypal';
import { getZarToUsdRate, zarToUsd } from '@/lib/fx';
import { schemas, validationError } from '@/lib/validation';

const input = schemas.support.create.and(z.object({ artistSlug: z.string().min(1) }));

export async function POST(req: NextRequest) {
  try {
    if (!isPayPalConfigured()) {
      return NextResponse.json({ error: 'PayPal support payments are not available right now.' }, { status: 503 });
    }

    const raw = await req.json();
    const parsed = input.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const { artistSlug, amount, message, fanName, fanEmail, isPublic, tier } = parsed.data;

    const artist = await prisma.artist.findUnique({ where: { slug: artistSlug } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const fx = await getZarToUsdRate();
    const amountUSD = zarToUsd(amount, fx.zarToUsdRate);
    if (amountUSD < 1) return NextResponse.json({ error: 'PayPal support requires at least $1 USD at the current exchange rate.' }, { status: 400 });

    const txn = await prisma.supportTxn.create({
      data: {
        fanEmail, fanName, artistId: artist.id, amount,
        currency: artist.currency || 'ZAR',
        message: message || '', tier: tier || 'Listener',
        isPublic: isPublic !== false, status: 'pending',
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com';
    const reference = `SUPP_${txn.id}`;
    const order = await paypal.orders.create({
      amountUSD,
      items: [{ name: `Support ${artist.name}`, description: 'Fan support for Vuka Music artist', amountUSD }],
      returnUrl: `${appUrl}/support/${artistSlug}?paypal=1&txnId=${txn.id}`,
      cancelUrl: `${appUrl}/support/${artistSlug}?cancelled=1`,
      reference,
      buyerEmail: fanEmail,
    }, `vuka-support-${txn.id}`);

    const approveUrl = getApproveUrl(order);
    if (!approveUrl) {
      await prisma.supportTxn.update({ where: { id: txn.id }, data: { status: 'failed' } }).catch(() => {});
      return NextResponse.json({ error: 'PayPal did not return an approval URL.' }, { status: 502 });
    }

    await prisma.supportTxn.update({
      where: { id: txn.id },
      data: { paystackReference: `paypal:${order.id}` },
    });

    return NextResponse.json({ authorizationUrl: approveUrl, method: 'paypal' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PayPal support checkout failed' }, { status: 500 });
  }
}
