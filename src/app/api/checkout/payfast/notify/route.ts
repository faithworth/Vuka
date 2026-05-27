// ============================================================
// PATCH 02 — src/app/api/checkout/payfast/notify/route.ts
// REPLACE the entire file.
// Fixes:
//   - Platform fee now 2% (not 0%)
//   - Exclusive beat → isActive:false + isExclusive:true on payment confirm
//   - Supports Video and Sample item types
//   - downloadCount incremented only when file actually fetched (not on page visit)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validatePayFastITN, PAYFAST_IPS } from '@/lib/payfast';
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';
import { sendPurchaseConfirmation, sendArtistSaleNotification } from '@/lib/emails';

const PLATFORM_FEE_RATE = 0.02; // 2%

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

    const paidAmount = parseFloat(data.amount_gross || '0');
    if (Math.abs(paidAmount - purchase.amount) > 0.01) {
      console.error(`Amount mismatch: paid ${paidAmount}, expected ${purchase.amount}`);
      return new NextResponse('Amount mismatch', { status: 400 });
    }

    // Calculate fee
    const platformFee = Math.round(purchase.amount * PLATFORM_FEE_RATE * 100) / 100;
    const netAmount = purchase.amount - platformFee;

    await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        status: 'confirmed',
        payfastPfPaymentId: pfPaymentId,
        platformFee,
        netAmount,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;

    let itemName = 'your purchase';
    let artistEmail = '';
    let artistName = '';
    let artworkUrl = '';
    let artistId = '';
    let paymentMethod = 'payfast';

    // ── BEAT ──────────────────────────────────────────────────
    if (purchase.itemType === 'beat' && purchase.beatId) {
      const beat = await prisma.beat.findUnique({
        where: { id: purchase.beatId },
        include: { artist: { include: { user: true } } },
      });
      if (beat) {
        itemName = beat.title;
        artistEmail = beat.artist.user.email;
        artistName = beat.artist.name;
        artworkUrl = beat.artworkUrl || '';
        artistId = beat.artist.id;
        paymentMethod = beat.artist.payfastMerchant ? 'payfast' : 'stripe';

        // Generate license PDF
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

        // Lock exclusive beat immediately and permanently
        if (purchase.licenseType === 'exclusive') {
          await prisma.beat.update({
            where: { id: beat.id },
            data: { isExclusive: true, isActive: false },
          });
        }

        await prisma.beat.update({ where: { id: beat.id }, data: { sales: { increment: 1 } } });
      }
    }

    // ── RELEASE ───────────────────────────────────────────────
    else if (purchase.itemType === 'release' && purchase.releaseId) {
      const release = await prisma.release.findUnique({
        where: { id: purchase.releaseId },
        include: { artist: { include: { user: true } } },
      });
      if (release) {
        itemName = release.title;
        artistEmail = release.artist.user.email;
        artistName = release.artist.name;
        artworkUrl = release.artworkUrl || '';
        artistId = release.artist.id;
        paymentMethod = release.artist.payfastMerchant ? 'payfast' : 'stripe';
        await prisma.release.update({ where: { id: release.id }, data: { sales: { increment: 1 } } });
      }
    }

    // ── VIDEO ─────────────────────────────────────────────────
    else if (purchase.itemType === 'video' && purchase.videoId) {
      const video = await prisma.video.findUnique({
        where: { id: purchase.videoId },
        include: { artist: { include: { user: true } } },
      });
      if (video) {
        itemName = video.title;
        artistEmail = video.artist.user.email;
        artistName = video.artist.name;
        artworkUrl = video.thumbnailUrl || '';
        artistId = video.artist.id;
        paymentMethod = video.artist.payfastMerchant ? 'payfast' : 'stripe';
        await prisma.video.update({ where: { id: video.id }, data: { sales: { increment: 1 } } });
      }
    }

    // ── SAMPLE PACK ───────────────────────────────────────────
    else if (purchase.itemType === 'sample' && purchase.sampleId) {
      const sample = await prisma.sample.findUnique({
        where: { id: purchase.sampleId },
        include: { artist: { include: { user: true } } },
      });
      if (sample) {
        itemName = sample.title;
        artistEmail = sample.artist.user.email;
        artistName = sample.artist.name;
        artworkUrl = sample.artworkUrl || '';
        artistId = sample.artist.id;
        paymentMethod = sample.artist.payfastMerchant ? 'payfast' : 'stripe';
        await prisma.sample.update({ where: { id: sample.id }, data: { sales: { increment: 1 } } });
      }
    }

    // ── CREATE PAYOUT RECORD ──────────────────────────────────
    if (artistId) {
      await prisma.artistPayout.create({
        data: {
          artistId,
          purchaseId,
          amount: purchase.amount,
          fee: platformFee,
          netAmount,
          method: paymentMethod,
          currency: purchase.currency,
          status: 'pending',
          payfastRef: pfPaymentId,
          notes: `${purchase.itemType} sale — ${itemName}`,
        },
      });
    }

    // ── SEND EMAILS ───────────────────────────────────────────
    try {
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
        artworkUrl: artworkUrl || undefined,
      });
    } catch (emailErr) {
      console.error('[notify] Failed to send buyer email:', emailErr);
    }

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
      } catch (emailErr) {
        console.error('[notify] Failed to send artist email:', emailErr);
      }
    }
  } catch (err) {
    console.error('PayFast webhook error:', err);
  }

  return NextResponse.json({ ok: true });
}
