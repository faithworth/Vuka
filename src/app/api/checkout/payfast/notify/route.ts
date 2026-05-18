import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validatePayFastITN, PAYFAST_IPS } from '@/lib/payfast';
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';
import { sendPurchaseConfirmation, sendArtistSaleNotification } from '@/lib/emails';

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') || '';

  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  if (!isSandbox && !PAYFAST_IPS.includes(clientIp)) {
    console.error('PayFast ITN from unknown IP:', clientIp);
    return new NextResponse('Forbidden', { status: 403 });
  }

  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => { data[key] = value.toString(); });

  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  if (!isSandbox && !validatePayFastITN(data, passphrase)) {
    console.error('PayFast ITN signature invalid');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  if (data.payment_status !== 'COMPLETE') {
    return NextResponse.json({ ok: true });
  }

  const purchaseId = data.m_payment_id;
  const pfPaymentId = data.pf_payment_id;

  try {
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) return new NextResponse('Purchase not found', { status: 404 });

    // Validate amount
    const paidAmount = parseFloat(data.amount_gross || '0');
    if (Math.abs(paidAmount - purchase.amount) > 0.01) {
      console.error(`Amount mismatch: paid ${paidAmount}, expected ${purchase.amount}`);
      return new NextResponse('Amount mismatch', { status: 400 });
    }

    await prisma.purchase.update({
      where: { id: purchaseId },
      data: { status: 'confirmed', payfastPfPaymentId: pfPaymentId },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;

    let itemName = 'your purchase';
    let artistEmail = '';
    let artistName = '';
    let artworkUrl = '';

    if (purchase.itemType === 'beat' && purchase.beatId) {
      const beat = await prisma.beat.findUnique({ where: { id: purchase.beatId }, include: { artist: { include: { user: true } } } });
      if (beat) {
        itemName = beat.title;
        artistEmail = beat.artist.user.email;
        artistName = beat.artist.name;
        artworkUrl = beat.artworkUrl || '';

        const pdfBuffer = await generateLicensePDF({
          licenseId: purchase.licenseId,
          licenseType: purchase.licenseType,
          beatTitle: beat.title,
          artistName: beat.artist.name,
          buyerName: purchase.buyerName,
          buyerEmail: purchase.buyerEmail,
          amount: purchase.amount,
          currency: purchase.currency,
          date: new Date(),
        });
        const pdfKey = r2Keys.license(purchase.licenseId);
        await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
        await prisma.purchase.update({ where: { id: purchaseId }, data: { licenseUrl: getPublicUrl(pdfKey) } });

        if (purchase.licenseType === 'exclusive') {
          await prisma.beat.update({ where: { id: beat.id }, data: { isExclusive: true, isActive: false } });
        }
        await prisma.beat.update({ where: { id: beat.id }, data: { sales: { increment: 1 } } });

        // Platform fee is 0% — artists keep 100% of every sale
        await prisma.artistPayout.create({
          data: {
            artistId: beat.artist.id,
            purchaseId: purchaseId,
            amount: purchase.amount,
            fee: 0,
            netAmount: purchase.amount,
            method: beat.artist.payfastMerchant ? 'payfast' : 'stripe',
            currency: purchase.currency,
            status: 'pending',
            payfastRef: pfPaymentId,
          },
        });
      }
    } else if (purchase.itemType === 'release' && purchase.releaseId) {
      const release = await prisma.release.findUnique({
        where: { id: purchase.releaseId },
        include: { artist: { include: { user: true } } }
      });
      if (release) {
        itemName = release.title;
        artistEmail = release.artist.user.email;
        artistName = release.artist.name;
        artworkUrl = release.artworkUrl || '';

        await prisma.release.update({ where: { id: purchase.releaseId }, data: { sales: { increment: 1 } } });

        // Platform fee is 0% — artists keep 100% of every sale
        await prisma.artistPayout.create({
          data: {
            artistId: release.artist.id,
            purchaseId: purchaseId,
            amount: purchase.amount,
            fee: 0,
            netAmount: purchase.amount,
            method: release.artist.payfastMerchant ? 'payfast' : 'stripe',
            currency: purchase.currency,
            status: 'pending',
            payfastRef: pfPaymentId,
          },
        });
      }
    }

    // Send buyer confirmation email — wrapped separately so a Resend failure
    // doesn't roll back the already-confirmed purchase or block artist notification.
    // NOTE: If using Resend's free tier with onboarding@resend.dev as the sender,
    // emails only deliver to your own verified address. Set EMAIL_FROM to an address
    // on a domain you have verified in Resend (e.g. "Vuka <no-reply@yourdomain.com>")
    // for emails to reach real buyers.
    try {
      const emailResult = await sendPurchaseConfirmation({
        to: purchase.buyerEmail,
        buyerName: purchase.buyerName,
        itemName,
        itemType: purchase.itemType,
        licenseType: purchase.licenseType || undefined,
        downloadUrl,
        amount: purchase.amount,
        currency: purchase.currency,
        licenseId: purchase.licenseId,
        artworkUrl: artworkUrl || undefined,
      });
      console.log('[notify] Buyer email sent to', purchase.buyerEmail, emailResult);
    } catch (emailErr) {
      console.error('[notify] Failed to send buyer email to', purchase.buyerEmail, emailErr);
    }

    // Send artist sale notification
    if (artistEmail) {
      try {
        await sendArtistSaleNotification({
          to: artistEmail,
          artistName,
          buyerName: purchase.buyerName,
          itemName,
          licenseType: purchase.licenseType || undefined,
          amount: purchase.amount,
          currency: purchase.currency,
          dashboardUrl: `${appUrl}/dashboard`,
        });
        console.log('[notify] Artist email sent to', artistEmail);
      } catch (emailErr) {
        console.error('[notify] Failed to send artist email to', artistEmail, emailErr);
      }
    }
  } catch (err) {
    console.error('PayFast webhook error:', err);
  }

  return NextResponse.json({ ok: true });
}
