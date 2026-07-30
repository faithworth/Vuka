
// src/lib/earnings.ts
// Royalty & Earnings Processing — payout processors and webhook handlers

import prisma from './prisma';
import { logger } from './logger';
import { getPlan } from './plans';
import { markPayoutPaid, rejectPayoutRequest } from './payouts';

// ── REVENUE SHARE CALCULATION ─────────────────────────────────

export async function calculateRevenueShare(params: {
  artistId: string;
  grossAmount: number;
  currency: string;
}): Promise<{
  grossAmount: number;
  vukaFeePercent: number;
  vukaFeeAmount: number;
  netAmount: number;
  currency: string;
}> {
  const artist = await prisma.artist.findUnique({
    where:  { id: params.artistId },
    select: { planSlug: true },
  });

  const plan           = getPlan(artist?.planSlug);
  const vukaFeePercent = plan.platformFeePct;
  const vukaFeeAmount  = parseFloat(((params.grossAmount * vukaFeePercent) / 100).toFixed(2));
  const netAmount      = parseFloat((params.grossAmount - vukaFeeAmount).toFixed(2));

  return {
    grossAmount: params.grossAmount,
    vukaFeePercent,
    vukaFeeAmount,
    netAmount,
    currency: params.currency || 'ZAR',
  };
}

// ── PAYOUT PROCESSORS ─────────────────────────────────────────
// Paystack Transfers API (primary/default), PayFast Payouts API (legacy),
// Flutterwave Transfers, PayPal Payouts
//
// NOTE: this entire section (processors, dispatcher, webhook handlers) was
// accidentally deleted by an earlier "remove distribution feature" commit
// that was only supposed to strip the DSP CSV-ingestion pipeline (section 1
// and 3 of the original file). That mistake broke the live Paystack
// transfer webhook (missing export) and the admin payout dispatch flow.
// Restored here from git history — the DSP column maps / CSV parser /
// ingestion pipeline are NOT restored, since removing those was correct.

// PayFast Payout (ZA artists — bank transfer via PayFast Payouts) — retained for
// accounts that still have a configured PAYFAST_API_KEY. Paystack is now the
// default/primary payout processor (see processPaystackPayout below).
export async function processPayFastPayout(params: {
  payoutRequestId: string;
  amount: number;
  currency: string;
  accountNumber: string;
  bankCode: string;
  accountHolder: string;
  reference: string;
}): Promise<{ success: boolean; referenceId?: string; error?: string }> {
  const { PAYFAST_API_KEY, PAYFAST_SANDBOX } = process.env;
  const host = PAYFAST_SANDBOX === 'true'
    ? 'https://sandbox.payfast.co.za'
    : 'https://api.payfast.co.za';

  try {
    const res = await fetch(`${host}/adhoc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAYFAST_API_KEY}`,
      },
      body: JSON.stringify({
        amount:         params.amount.toFixed(2),
        currency:       params.currency || 'ZAR',
        account_number: params.accountNumber,
        bank_code:      params.bankCode,
        account_holder: params.accountHolder,
        reference:      params.reference,
        description:    'Vuka Music Royalties',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `PayFast API error ${res.status}: ${body}` };
    }

    const data: { token?: string; status?: string } = await res.json();
    return { success: true, referenceId: data.token };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'PayFast payout failed',
    };
  }
}

// Paystack Payout (ZA artists — Transfer Recipient + Transfer API)
// Default/primary payout processor. Creates a transfer recipient for the
// artist's bank account, then initiates a transfer for the payout amount.
export async function processPaystackPayout(params: {
  payoutRequestId: string;
  amount: number;
  currency: string;
  accountNumber: string;
  bankCode: string;
  accountHolder: string;
  reference: string;
}): Promise<{ success: boolean; referenceId?: string; error?: string }> {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? '';
  if (!PAYSTACK_SECRET_KEY) {
    return { success: false, error: 'PAYSTACK_SECRET_KEY not configured' };
  }

  try {
    // Step 1: create (or re-use) a transfer recipient for this bank account
    const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
      body: JSON.stringify({
        type:           'basa', // South African bank account
        name:           params.accountHolder,
        account_number: params.accountNumber,
        bank_code:      params.bankCode,
        currency:       params.currency || 'ZAR',
      }),
    });

    if (!recipientRes.ok) {
      const body = await recipientRes.text();
      return { success: false, error: `Paystack recipient error ${recipientRes.status}: ${body}` };
    }

    const recipientData: { data?: { recipient_code?: string } } = await recipientRes.json();
    const recipientCode = recipientData.data?.recipient_code;
    if (!recipientCode) {
      return { success: false, error: 'Paystack did not return a recipient_code' };
    }

    // Step 2: initiate the transfer
    const transferRes = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
      body: JSON.stringify({
        source:    'balance',
        amount:    Math.round(params.amount * 100), // kobo/cents
        recipient: recipientCode,
        reason:    'Vuka Music Royalties',
        reference: params.reference,
      }),
    });

    if (!transferRes.ok) {
      const body = await transferRes.text();
      return { success: false, error: `Paystack transfer error ${transferRes.status}: ${body}` };
    }

    const transferData: { data?: { transfer_code?: string; reference?: string } } = await transferRes.json();
    return { success: true, referenceId: transferData.data?.transfer_code || transferData.data?.reference };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Paystack payout failed',
    };
  }
}

// Flutterwave Transfer (Pan-Africa)
export async function processFlutterwavePayout(params: {
  payoutRequestId: string;
  amount: number;
  currency: string;
  accountNumber: string;
  bankCode: string;
  accountHolder: string;
  reference: string;
  country?: string;
}): Promise<{ success: boolean; referenceId?: string; error?: string }> {
  const { FLUTTERWAVE_SECRET_KEY } = process.env;
  if (!FLUTTERWAVE_SECRET_KEY) {
    return { success: false, error: 'FLUTTERWAVE_SECRET_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
      },
      body: JSON.stringify({
        account_bank:   params.bankCode,
        account_number: params.accountNumber,
        amount:         params.amount,
        narration:      'Vuka Music Royalties',
        currency:       params.currency || 'ZAR',
        reference:      params.reference,
        callback_url:   `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/flutterwave`,
        debit_currency: params.currency || 'ZAR',
        meta: {
          sender:             'Vuka Music Distribution',
          sender_country:     params.country || 'ZA',
          mobile_number:      '',
          recipient_address:  '',
          sender_id_number:   '',
          transfer_purpose:   'Music Royalty Payment',
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Flutterwave error ${res.status}: ${body}` };
    }

    const data: { data?: { id?: number; status?: string } } = await res.json();
    return { success: true, referenceId: String(data.data?.id || '') };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Flutterwave transfer failed',
    };
  }
}

// PayPal Payouts (International)
export async function processPayPalPayout(params: {
  payoutRequestId: string;
  amount: number;
  currency: string;
  paypalEmail: string;
  reference: string;
}): Promise<{ success: boolean; referenceId?: string; error?: string }> {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_SANDBOX } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { success: false, error: 'PayPal credentials not configured' };
  }

  const host = PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    // Get access token
    const tokenRes = await fetch(`${host}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      return { success: false, error: 'PayPal auth failed' };
    }

    const { access_token }: { access_token: string } = await tokenRes.json();

    // Send payout
    const payoutRes = await fetch(`${host}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: params.reference,
          email_subject:   'Vuka Music Royalty Payment',
          email_message:   'You have received a royalty payment from Vuka Music.',
        },
        items: [{
          recipient_type: 'EMAIL',
          amount: {
            value:    params.amount.toFixed(2),
            currency: params.currency || 'USD',
          },
          receiver:  params.paypalEmail,
          note:      'Vuka Music Royalties',
          sender_item_id: params.payoutRequestId,
        }],
      }),
    });

    if (!payoutRes.ok) {
      const body = await payoutRes.text();
      return { success: false, error: `PayPal payout error ${payoutRes.status}: ${body}` };
    }

    const data: { batch_header?: { payout_batch_id?: string } } = await payoutRes.json();
    return { success: true, referenceId: data.batch_header?.payout_batch_id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'PayPal payout failed',
    };
  }
}

// ── PAYOUT DISPATCHER ─────────────────────────────────────────
// Routes an approved PayoutRequest to the correct processor.

export type PayoutMethod = 'paystack' | 'payfast' | 'flutterwave' | 'paypal' | 'bank_transfer';

export async function dispatchPayout(payoutRequestId: string): Promise<{
  success: boolean;
  referenceId?: string;
  error?: string;
}> {
  const request = await prisma.payoutRequest.findUnique({
    where: { id: payoutRequestId },
    include: {
      bankAccount: true,
      artist: { include: { user: { select: { email: true } } } },
    },
  });

  if (!request) return { success: false, error: 'Payout request not found' };
  if (request.status !== 'approved') {
    return { success: false, error: `Cannot dispatch: status is ${request.status}` };
  }

  // Mark as processing
  await prisma.payoutRequest.update({
    where: { id: payoutRequestId },
    data: { status: 'processing' },
  });

  const reference = `VUKA-${payoutRequestId.slice(-8).toUpperCase()}`;
  let result: { success: boolean; referenceId?: string; error?: string };

  const method = (request.bankAccount?.accountType || 'bank_transfer') as PayoutMethod;

  if (method === 'paypal') {
    const paypalEmail = request.artist.user?.email || '';
    result = await processPayPalPayout({
      payoutRequestId,
      amount: request.amount,
      currency: request.currency,
      paypalEmail,
      reference,
    });
  } else if (method === 'flutterwave') {
    const ba = request.bankAccount;
    result = await processFlutterwavePayout({
      payoutRequestId,
      amount: request.amount,
      currency: request.currency,
      accountNumber: ba?.accountNumber || '',
      bankCode: ba?.branchCode || '',
      accountHolder: ba?.accountHolder || '',
      reference,
      country: 'ZA',
    });
  } else if (method === 'payfast') {
    // Explicit PayFast — only used for accounts still configured with PAYFAST_API_KEY
    const ba = request.bankAccount;
    result = await processPayFastPayout({
      payoutRequestId,
      amount: request.amount,
      currency: request.currency,
      accountNumber: ba?.accountNumber || '',
      bankCode: ba?.branchCode || '',
      accountHolder: ba?.accountHolder || '',
      reference,
    });
  } else {
    // paystack or bank_transfer — default to Paystack Transfers API
    const ba = request.bankAccount;
    result = await processPaystackPayout({
      payoutRequestId,
      amount: request.amount,
      currency: request.currency,
      accountNumber: ba?.accountNumber || '',
      bankCode: ba?.branchCode || '',
      accountHolder: ba?.accountHolder || '',
      reference,
    });
  }

  if (result.success) {
    await prisma.payoutRequest.update({
      where: { id: payoutRequestId },
      data: {
        status: 'processing',
        adminNotes: `Dispatched via ${method} — ref: ${result.referenceId || reference}`,
        processedAt: new Date(),
      },
    });
  } else {
    await prisma.payoutRequest.update({
      where: { id: payoutRequestId },
      data: {
        status: 'rejected',
        adminNotes: `Dispatch failed: ${result.error}`,
      },
    });
  }

  return result;
}

// ── WEBHOOK STATUS HANDLERS ────────────────────────────────────
// All handlers use markPayoutPaid() / rejectPayoutRequest() from payouts.ts
// so the original claimed ledger rows are settled in place instead of
// creating duplicate 'paid' rows.

// ── Paystack transfer webhook ─────────────────────────────────
export async function handlePaystackTransferWebhook(payload: {
  event: string;
  data: {
    reference: string;
    transfer_code?: string;
    status: string;
    reason?: string;
  };
}): Promise<void> {
  const { event, data } = payload;
  if (event !== 'transfer.success' && event !== 'transfer.failed') return;

  // Reference format: VUKA-XXXXXXXX (last 8 chars of payoutRequestId, upper)
  const refSuffix = (data.reference || '').replace('VUKA-', '').toLowerCase();
  if (!refSuffix) return;

  const request = await prisma.payoutRequest.findFirst({
    where: { id: { endsWith: refSuffix } },
  });
  if (!request) {
    logger.warn('[earnings] Paystack transfer webhook — no matching PayoutRequest', { ref: data.reference });
    return;
  }

  if (event === 'transfer.success') {
    await markPayoutPaid(request.id, data.transfer_code || data.reference);
    logger.info('[earnings] Paystack transfer succeeded', { requestId: request.id, ref: data.reference });
  } else {
    await rejectPayoutRequest(request.id, `Paystack transfer failed — ${data.reason || data.status}`);
    logger.warn('[earnings] Paystack transfer failed', { requestId: request.id, ref: data.reference });
  }
}

export async function handleFlutterwaveWebhook(payload: {
  event: string;
  data: {
    id: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    complete_message?: string;
  };
}): Promise<void> {
  const { event, data } = payload;
  if (event !== 'transfer.completed' && event !== 'transfer.failed') return;

  const refSuffix = data.reference?.replace('VUKA-', '').toLowerCase();
  if (!refSuffix) return;

  const request = await prisma.payoutRequest.findFirst({
    where: { id: { endsWith: refSuffix } },
  });
  if (!request) return;

  if (data.status === 'SUCCESSFUL') {
    await markPayoutPaid(request.id, data.reference);
  } else {
    await rejectPayoutRequest(request.id, `Flutterwave transfer failed — ${data.complete_message || data.status}`);
  }
}

export async function handlePayPalWebhook(payload: {
  event_type: string;
  resource: {
    batch_header?: {
      payout_batch_id: string;
      batch_status: string;
      sender_batch_header: { sender_batch_id: string };
    };
    payout_item_id?: string;
    transaction_status?: string;
  };
}): Promise<void> {
  const { event_type, resource } = payload;
  if (!event_type.startsWith('PAYMENT.PAYOUTS-ITEM')) return;

  const senderBatchId = resource.batch_header?.sender_batch_header?.sender_batch_id || '';
  const refSuffix = senderBatchId.replace('VUKA-', '').toLowerCase();
  if (!refSuffix) return;

  const request = await prisma.payoutRequest.findFirst({
    where: { id: { endsWith: refSuffix } },
  });
  if (!request) return;

  const success = event_type === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED';
  const failed  = event_type === 'PAYMENT.PAYOUTS-ITEM.FAILED' || event_type === 'PAYMENT.PAYOUTS-ITEM.RETURNED';

  if (success) {
    await markPayoutPaid(request.id, senderBatchId);
  } else if (failed) {
    await rejectPayoutRequest(request.id, `PayPal payout failed — ${event_type}`);
  }
}
