// src/lib/splits.ts
// Auto-disbursement engine for split sheets.
// Called after every confirmed purchase — checks if a split sheet exists
// for the purchased item, then distributes the net amount to each recipient.

import prisma from '@/lib/prisma';
import { platformFeeRate } from '@/lib/plans';

interface DisburseParams {
  itemType:            string;
  itemId:              string;
  purchaseId:          string;
  grossAmount:         number;
  artistPlanSlug?:     string | null;
  artistPlanExpiry?:   Date | null;
  lifetimeGrossSales?: number;
}

export async function disburseSplitSheet(params: DisburseParams): Promise<void> {
  const { itemType, itemId, purchaseId, grossAmount, artistPlanSlug, artistPlanExpiry, lifetimeGrossSales = 0 } = params;

  const sheet = await prisma.splitSheet.findUnique({
    where:   { itemType_itemId: { itemType, itemId } },
    include: { splits: true },
  });
  if (!sheet) return; // no split sheet — nothing to do

  // Lock the sheet on first sale
  if (!sheet.isLocked) {
    await prisma.splitSheet.update({ where: { id: sheet.id }, data: { isLocked: true } });
  }

  const feeRate    = platformFeeRate(artistPlanSlug ?? 'free', artistPlanExpiry, lifetimeGrossSales);
  const platformFee = Math.round(grossAmount * feeRate * 100) / 100;
  const totalNet    = Math.round((grossAmount - platformFee) * 100) / 100;

  // Validate percentages sum to ~100
  const totalPct = sheet.splits.reduce((s, r) => s + r.percentage, 0);
  if (Math.abs(totalPct - 100) > 0.5) {
    console.error(`[splits] Sheet ${sheet.id} percentages sum to ${totalPct} — skipping disbursement`);
    return;
  }

  // Create disbursement record
  const disbursement = await prisma.splitDisbursement.create({
    data: {
      id:          `sd_${Date.now()}`,
      splitSheetId: sheet.id,
      purchaseId,
      totalGross:  grossAmount,
      platformFee,
      totalNet,
      status:      'processing',
    },
  });

  // Queue individual payouts via Paystack transfer per recipient
  let allOk = true;
  for (const recipient of sheet.splits) {
    const recipientAmount = Math.round((totalNet * recipient.percentage / 100) * 100) / 100;
    if (recipientAmount <= 0) continue;

    try {
      // If the recipient is a Vuka Music artist, credit their ArtistPayout wallet
      if (recipient.artistId) {
        await prisma.artistPayout.create({
          data: {
            id:         `ap_split_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            artistId:   recipient.artistId,
            purchaseId,
            amount:     recipientAmount,
            method:     'paystack',
            currency:   'ZAR',
            status:     'pending',
            reference:  `split_${disbursement.id}_${recipient.id}`,
            notes:      `Split: ${recipient.percentage}% from ${sheet.title}`,
          },
        });
      }
      // External recipient — initiate Paystack transfer
      else {
        await initiateExternalTransfer({
          email:       recipient.email,
          name:        recipient.name,
          amount:      recipientAmount,
          reference:   `split_${disbursement.id}_${recipient.id}`,
          reason:      `Split payment: ${sheet.title}`,
          existingCode: recipient.paystackRecipientCode || undefined,
        });
      }
    } catch (e) {
      console.error(`[splits] Failed to disburse to ${recipient.email}:`, e);
      allOk = false;
    }
  }

  await prisma.splitDisbursement.update({
    where: { id: disbursement.id },
    data:  { status: allOk ? 'completed' : 'failed', processedAt: new Date() },
  });
}

async function initiateExternalTransfer(params: {
  email:        string;
  name:         string;
  amount:       number;
  reference:    string;
  reason:       string;
  existingCode?: string;
}) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY not set');

  let recipientCode = params.existingCode;

  // Create transfer recipient if needed
  if (!recipientCode) {
    const recipRes = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'nuban', name: params.name, email: params.email, currency: 'ZAR' }),
    });
    const recipData = await recipRes.json();
    if (!recipData.status) throw new Error(`Recipient creation failed: ${recipData.message}`);
    recipientCode = recipData.data.recipient_code;
  }

  // Initiate transfer
  const transferRes = await fetch('https://api.paystack.co/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source:    'balance',
      amount:    Math.round(params.amount * 100), // kobo/cents
      recipient: recipientCode,
      reason:    params.reason,
      reference: params.reference,
      currency:  'ZAR',
    }),
  });
  const transferData = await transferRes.json();
  if (!transferData.status) throw new Error(`Transfer failed: ${transferData.message}`);
  return transferData.data;
}
