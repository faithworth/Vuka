import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import prisma from '@/lib/prisma';
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';
import { sendPurchaseConfirmation, sendArtistSaleNotification } from '@/lib/emails';
import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata || {};
    const { purchaseId, itemType, itemId, licenseType, buyerEmail, buyerName, licenseId, artworkUrl, artistEmail } = meta;

    try {
      const purchase = await prisma.purchase.update({
        where: { id: purchaseId },
        data: {
          status: 'confirmed',
          stripePaymentId: session.payment_intent as string,
        },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;

      // Generate license PDF for beats
      let licenseUrl = '';
      let beatArtist = null;
      if (itemType === 'beat' && licenseType) {
        const beat = await prisma.beat.findUnique({ where: { id: itemId }, include: { artist: true } });
        if (beat) {
          beatArtist = beat.artist;
          const pdfBuffer = await generateLicensePDF({
            licenseId,
            licenseType,
            beatTitle: beat.title,
            artistName: beat.artist.name,
            buyerName,
            buyerEmail,
            amount: purchase.amount,
            currency: purchase.currency,
            date: new Date(),
          });
          const pdfKey = r2Keys.license(licenseId);
          await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
          licenseUrl = getPublicUrl(pdfKey);

          await prisma.purchase.update({ where: { id: purchaseId }, data: { licenseUrl } });

          // Lock beat if exclusive
          if (licenseType === 'exclusive') {
            await prisma.beat.update({ where: { id: itemId }, data: { isExclusive: true, isActive: false } });
          }
          // Increment sales
          await prisma.beat.update({ where: { id: itemId }, data: { sales: { increment: 1 } } });

          // Create artist payout record with 1% fee
          const feeAmount = purchase.amount * 0.01;
          const netAmount = purchase.amount - feeAmount;
          await prisma.artistPayout.create({
            data: {
              artistId: beat.artist.id,
              purchaseId: purchaseId,
              amount: purchase.amount,
              fee: feeAmount,
              netAmount: netAmount,
              method: beat.artist.payfastMerchant ? 'payfast' : (beat.artist.stripeAccountId ? 'stripe' : 'payfast'),
              currency: purchase.currency,
              status: 'pending',
              notes: `Sale via Stripe. Payment ID: ${session.payment_intent}`,
            },
          });
        }
      } else if (itemType === 'release') {
        const release = await prisma.release.findUnique({
          where: { id: itemId },
          include: { artist: true }
        });
        if (release) {
          beatArtist = release.artist;
          await prisma.release.update({ where: { id: itemId }, data: { sales: { increment: 1 } } });

          // Create artist payout record with 1% fee
          const feeAmount = purchase.amount * 0.01;
          const netAmount = purchase.amount - feeAmount;
          await prisma.artistPayout.create({
            data: {
              artistId: release.artist.id,
              purchaseId: purchaseId,
              amount: purchase.amount,
              fee: feeAmount,
              netAmount: netAmount,
              method: release.artist.payfastMerchant ? 'payfast' : (release.artist.stripeAccountId ? 'stripe' : 'payfast'),
              currency: purchase.currency,
              status: 'pending',
              notes: `Sale via Stripe. Payment ID: ${session.payment_intent}`,
            },
          });
        }
      }

      // Send emails
      await sendPurchaseConfirmation({
        to: buyerEmail,
        buyerName,
        itemName: meta.itemName || 'your purchase',
        itemType,
        licenseType: licenseType || undefined,
        downloadUrl,
        amount: purchase.amount,
        currency: purchase.currency,
        licenseId,
        artworkUrl: artworkUrl || undefined,
      });

      if (artistEmail) {
        await sendArtistSaleNotification({
          to: artistEmail,
          artistName: 'there',
          buyerName,
          itemName: meta.itemName || 'item',
          licenseType: licenseType || undefined,
          amount: purchase.amount,
          currency: purchase.currency,
          dashboardUrl: `${appUrl}/dashboard`,
        });
      }
    } catch (err) {
      console.error('Webhook processing error:', err);
    }
  }

  return NextResponse.json({ received: true });
}
