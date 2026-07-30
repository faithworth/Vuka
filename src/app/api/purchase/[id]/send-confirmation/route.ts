
/**
 * POST /api/purchase/[id]/send-confirmation
 *
 * Called by the success page when it detects a purchase has become 'confirmed'.
  * Acts as a belt-and-suspenders fallback in case the Paystack webhook notify route
 * either timed out before reaching the email send, or the Resend call failed.
 *
 * Deduplication: uses `receiptUrl` field as a sent-sentinel.
 * If receiptUrl === 'email:sent', the confirmation was already emailed — skip.
 * Otherwise: send the email and mark receiptUrl = 'email:sent'.
 *
 * Safe to call multiple times — idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendPurchaseConfirmation } from '@/lib/emails';
import { generateLicensePDF } from '@/lib/pdf';
import { uploadBuffer, r2Keys, getPublicUrl } from '@/lib/r2';
import { platformFee } from '@/lib/plans';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const EMAIL_SENT_SENTINEL = 'email:sent';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        beat:               { select: { title: true, artworkUrl: true } },
        release:            { select: { title: true, artworkUrl: true } },
        video:              { select: { title: true, thumbnailUrl: true } },
        sample:             { select: { title: true, artworkUrl: true } },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // ── Step 1: If still pending (webhook never fired), confirm it now ──
    if (purchase.status === 'pending') {
      // Compute fees so stats are correct
      let artistPlanSlug: string | null = null;
      let artistPlanExpiresAt: Date | null = null;
      if (purchase.beatId) {
        const beat = await prisma.beat.findUnique({ where: { id: purchase.beatId }, select: { artist: { select: { planSlug: true, planExpiresAt: true } } } });
        artistPlanSlug = beat?.artist?.planSlug ?? null;
        artistPlanExpiresAt = beat?.artist?.planExpiresAt ?? null;
      } else if ((purchase as any).releaseId) {
        const rel = await prisma.release.findUnique({ where: { id: (purchase as any).releaseId }, select: { artist: { select: { planSlug: true, planExpiresAt: true } } } });
        artistPlanSlug = rel?.artist?.planSlug ?? null;
        artistPlanExpiresAt = rel?.artist?.planExpiresAt ?? null;
      }
      const platformFeeAmt = platformFee(purchase.amount, artistPlanSlug, artistPlanExpiresAt);
      const netAmount = Math.round((purchase.amount - platformFeeAmt) * 100) / 100;

      await prisma.purchase.update({
        where: { id },
        data: { status: 'confirmed', platformFee: platformFeeAmt, netAmount },
      });

      // Increment beat/release sales counter
      if (purchase.itemType === 'beat' && purchase.beatId) {
        await prisma.beat.update({ where: { id: purchase.beatId }, data: { sales: { increment: 1 } } }).catch(() => {});
      } else if (purchase.itemType === 'release' && (purchase as any).releaseId) {
        await prisma.release.update({ where: { id: (purchase as any).releaseId }, data: { sales: { increment: 1 } } }).catch(() => {});
      }

      // Create artist payout record
      const artistId = (purchase as any).artistId;
      if (artistId) {
        await prisma.artistPayout.create({
          data: {
            artistId,
            purchaseId: id,
            amount: netAmount,
            method: 'paystack',
            currency: purchase.currency,
            status: 'pending',
            reference: purchase.paystackReference || `fallback-${id}`,
            notes: `${purchase.itemType} sale (confirmed via fallback)`,
          },
        }).catch(() => {});
      }

      // Re-fetch with updated status
      Object.assign(purchase, { status: 'confirmed', platformFee: platformFeeAmt, netAmount });
    }

    // Only send for confirmed purchases
    if (purchase.status !== 'confirmed') {
      return NextResponse.json({ skipped: 'not_confirmed' });
    }

    // Idempotency — already sent
    if (purchase.receiptUrl === EMAIL_SENT_SENTINEL) {
      return NextResponse.json({ skipped: 'already_sent' });
    }

    // ── Step 2: Generate license PDF if missing (beat purchases only) ──
    let resolvedLicenseUrl = purchase.licenseUrl || undefined;
    if (purchase.itemType === 'beat' && purchase.beatId && !resolvedLicenseUrl) {
      try {
        const beat = await prisma.beat.findUnique({
          where: { id: purchase.beatId },
          include: { artist: true },
        });
        if (beat) {
          const pdfBuffer = await generateLicensePDF({
            licenseId:   purchase.licenseId,
            licenseType: purchase.licenseType || 'basic',
            beatTitle:   beat.title,
            artistName:  beat.artist.name,
            buyerName:   purchase.buyerName,
            buyerEmail:  purchase.buyerEmail,
            amount:      purchase.amount,
            currency:    purchase.currency,
            date:        new Date(),
          });
          const pdfKey = r2Keys.license(purchase.licenseId);
          await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
          resolvedLicenseUrl = getPublicUrl(pdfKey);
          await prisma.purchase.update({ where: { id }, data: { licenseUrl: resolvedLicenseUrl } });
          logger.info('[send-confirmation] PDF generated', { purchaseId: id });
        }
      } catch (pdfErr) {
        logger.error('[send-confirmation] PDF generation failed', { purchaseId: id, error: String(pdfErr) });
        // Continue — send email without PDF rather than blocking entirely
      }
    }

    const appUrl     = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';
    const downloadUrl = `${appUrl}/download/${purchase.downloadToken}`;

    const itemName =
      purchase.beat?.title ||
      purchase.release?.title ||
      purchase.video?.title ||
      purchase.sample?.title ||
      'your purchase';

    const artworkUrl =
      purchase.beat?.artworkUrl ||
      purchase.release?.artworkUrl ||
      (purchase as any).sample?.artworkUrl ||
      (purchase as any).video?.thumbnailUrl ||
      undefined;

    await sendPurchaseConfirmation({
      to:          purchase.buyerEmail,
      buyerName:   purchase.buyerName,
      itemName,
      itemType:    purchase.itemType,
      licenseType: purchase.licenseType || undefined,
      downloadUrl,
      amount:      purchase.amount,
      currency:    purchase.currency,
      licenseId:   purchase.licenseId,
      artworkUrl:  artworkUrl || undefined,
      licenseUrl:  resolvedLicenseUrl,
    });

    // Mark as sent so notify (if it runs later) doesn't double-send
    await prisma.purchase.update({
      where: { id },
      data:  { receiptUrl: EMAIL_SENT_SENTINEL },
    });

    logger.info('[send-confirmation] Fallback email sent', { purchaseId: id });
    return NextResponse.json({ ok: true });

  } catch (err) {
    logger.error('[send-confirmation] Failed', {
      purchaseId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Email failed' }, { status: 500 });
  }
}
