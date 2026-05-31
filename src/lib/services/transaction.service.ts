// src/lib/services/transaction.service.ts
// Centralized transaction service — all purchases, licenses, and payout records
// go through here. Uses Prisma interactive transactions so nothing partially commits.

import prisma from '@/lib/prisma';
import { createNotification, notifyArtistOfSale } from './notification.service';

// ── Types ────────────────────────────────────────────────────

export interface BeatPurchaseInput {
  buyerUserId: string;
  buyerName: string;
  artistId: string;
  artistUserId: string;
  beatId: string;
  beatTitle: string;
  amount: number; // gross paid by buyer (ZAR)
  currency?: string;
  licenseType?: string; // basic | exclusive | unlimited
  paymentRef?: string; // PayFast payment ID or EFT reference
  downloadToken?: string;
}

export interface ReleasePurchaseInput {
  buyerUserId: string;
  buyerName: string;
  artistId: string;
  artistUserId: string;
  releaseId: string;
  releaseTitle: string;
  amount: number;
  currency?: string;
  paymentRef?: string;
  downloadToken?: string;
}

const PLATFORM_FEE_PCT = 0.15; // 15% platform commission

// ── Beat Purchase ─────────────────────────────────────────────

export async function processBeatPurchase(input: BeatPurchaseInput) {
  const {
    buyerUserId, buyerName, artistId, artistUserId,
    beatId, beatTitle, amount, currency = 'ZAR',
    licenseType = 'basic', paymentRef, downloadToken,
  } = input;

  const platformFee = Math.round(amount * PLATFORM_FEE_PCT * 100) / 100;
  const artistNet = Math.round((amount - platformFee) * 100) / 100;

  return prisma.$transaction(async (tx) => {
    // 1. Create purchase record
    const purchase = await tx.purchase.create({
      data: {
        userId: buyerUserId,
        beatId,
        amount,
        currency,
        licenseType,
        paymentRef: paymentRef ?? null,
        downloadToken: downloadToken ?? null,
        status: 'completed',
      },
    });

    // 2. Increment beat sales counter
    await tx.beat.update({
      where: { id: beatId },
      data: { sales: { increment: 1 } },
    });

    // 3. Record artist payout (pending — will be batched to actual payout)
    await tx.artistPayout.create({
      data: {
        artistId,
        amount: artistNet,
        method: 'platform',
        status: 'pending',
        notes: `Beat sale: ${beatTitle} (purchase ${purchase.id})`,
      },
    });

    return { purchase, artistNet, platformFee };
  }).then(async (result) => {
    // Fire notifications outside the transaction (non-critical)
    await notifyArtistOfSale(artistUserId, buyerName, beatTitle, amount, currency);
    return result;
  });
}

// ── Release Purchase ──────────────────────────────────────────

export async function processReleasePurchase(input: ReleasePurchaseInput) {
  const {
    buyerUserId, buyerName, artistId, artistUserId,
    releaseId, releaseTitle, amount, currency = 'ZAR',
    paymentRef, downloadToken,
  } = input;

  const platformFee = Math.round(amount * PLATFORM_FEE_PCT * 100) / 100;
  const artistNet = Math.round((amount - platformFee) * 100) / 100;

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        userId: buyerUserId,
        releaseId,
        amount,
        currency,
        paymentRef: paymentRef ?? null,
        downloadToken: downloadToken ?? null,
        status: 'completed',
      },
    });

    await tx.release.update({
      where: { id: releaseId },
      data: { sales: { increment: 1 } },
    });

    await tx.artistPayout.create({
      data: {
        artistId,
        amount: artistNet,
        method: 'platform',
        status: 'pending',
        notes: `Release sale: ${releaseTitle} (purchase ${purchase.id})`,
      },
    });

    return { purchase, artistNet, platformFee };
  }).then(async (result) => {
    await notifyArtistOfSale(artistUserId, buyerName, releaseTitle, amount, currency);
    return result;
  });
}

// ── Verify buyer hasn't already purchased ────────────────────

export async function hasPurchased(
  userId: string,
  beatId?: string,
  releaseId?: string
): Promise<boolean> {
  const where: any = { userId };
  if (beatId) where.beatId = beatId;
  if (releaseId) where.releaseId = releaseId;

  const existing = await prisma.purchase.findFirst({ where });
  return !!existing;
}

// ── Get a user's purchase download entitlement ───────────────

export async function getDownloadEntitlement(
  userId: string,
  token: string
): Promise<{ valid: boolean; beatId?: string; releaseId?: string }> {
  const purchase = await prisma.purchase.findFirst({
    where: { userId, downloadToken: token, status: 'completed' },
    select: { beatId: true, releaseId: true },
  });

  if (!purchase) return { valid: false };
  return { valid: true, beatId: purchase.beatId ?? undefined, releaseId: purchase.releaseId ?? undefined };
}
