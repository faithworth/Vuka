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

    if (purchase.itemType === 'beat' && purchase.beatId) {
      const beat = await prisma.beat.findUnique({ where: { id: purchase.beatId }, include: { artist: { include: { user: true } } } });
      if (beat) {
        itemName = beat.title;
        artistEmail = beat.artist.user.email;
        artistName = beat.artist.name;

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

        const feeAmount = purchase.amount * 0.01;
        const netAmount = purchase.amount - feeAmount;
        await prisma.artistPayout.create({
          data: {
            artistId: beat.artist.id,
            purchaseId: purchaseId,
            amount: purchase.amount,
            fee: feeAmount,
            netAmount: netAmount,
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

        await prisma.release.update({ where: { id: purchase.releaseId }, data: { sales: { increment: 1 } } });

        const feeAmount = purchase.amount * 0.01;
        const netAmount = purchase.amount - feeAmount;
        await prisma.artistPayout.create({
          data: {
            artistId: release.artist.id,
            purchaseId: purchaseId,
            amount: purchase.amount,
            fee: feeAmount,
            netAmount: netAmount,
            method: release.artist.payfastMerchant ? 'payfast' : 'stripe',
            currency: purchase.currency,
            status: 'pending',
            payfastRef: pfPaymentId,
          },
        });
      }
    }

    // Send buyer confirmation email with download link
    await sendPurchaseConfirmation({
      to: purchase.buyerEmail,
      buyerName: purchase.buyerName,
      itemName,
      itemType: purchase.itemType,
      licenseType: purchase.licenseType || undefined,
      downloadUrl,
      amount: purchase.amount,
      currency: purchase.currency,
      licenseId: purchase.licenseId,
    });

    // Send artist sale notification
    if (artistEmail) {
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
    }
  } catch (err) {
    console.error('PayFast webhook error:', err);
  }

  return NextResponse.json({ ok: true });
}
