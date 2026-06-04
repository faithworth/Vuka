/**
 * POST /api/support/create-session
 *
 * Phase 12 — PayFast-only support payments (Stripe removed).
 * Used by the fan support page (/support/[artistSlug]) to create a payment.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildPayFastForm } from '@/lib/payfast';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? 'no-trace';

  try {
    const { artistSlug, amount, message, fanName, fanEmail, isPublic, tier } = await req.json();

    if (!artistSlug || !amount || !fanEmail || !fanName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const artist = await prisma.artist.findUnique({
      where: { slug: artistSlug },
      include: { user: true },
    });
    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const txn = await prisma.supportTxn.create({
      data: {
        fanEmail,
        fanName,
        artistId:  artist.id,
        amount,
        currency:  artist.currency || 'ZAR',
        message:   message || '',
        tier:      tier || 'Listener',
        isPublic:  isPublic !== false,
        status:    'pending',
      },
    });

    const appUrl      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const isSandbox   = process.env.PAYFAST_SANDBOX === 'true';
    const merchantId  = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10000100')
      : (artist.payfastMerchant || process.env.PAYFAST_MERCHANT_ID);
    const merchantKey = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '46f0cd694581a')
      : process.env.PAYFAST_MERCHANT_KEY;
    const passphrase  = isSandbox
      ? (process.env.PAYFAST_SANDBOX_PASSPHRASE || '')
      : (process.env.PAYFAST_PASSPHRASE || '');

    if (!merchantId || !merchantKey) {
      logger.error('[support/create-session] No PayFast credentials configured', { traceId });
      return NextResponse.json(
        { error: 'Payment gateway not configured. Contact platform support.' },
        { status: 500 }
      );
    }

    const formData = buildPayFastForm(
      {
        merchant_id:   merchantId,
        merchant_key:  merchantKey,
        return_url:    `${appUrl}/support/${artistSlug}?success=1&txnId=${txn.id}`,
        cancel_url:    `${appUrl}/support/${artistSlug}`,
        notify_url:    `${appUrl}/api/support/payfast-notify`,
        name_first:    fanName.split(' ')[0] || fanName,
        name_last:     fanName.split(' ').slice(1).join(' ') || '',
        email_address: fanEmail,
        m_payment_id:  txn.id,
        amount:        Number(amount).toFixed(2),
        item_name:     `Support ${artist.name}`.substring(0, 100),
        custom_str1:   artist.id,
        custom_str2:   'support',
        custom_str3:   tier || 'Listener',
        custom_str4:   artist.user.email,
      },
      passphrase
    );

    logger.info('[support/create-session] PayFast form built', {
      traceId, txnId: txn.id, amount, artistId: artist.id,
    });

    return NextResponse.json({
      formData,
      actionUrl: isSandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process',
      method: 'payfast',
    });

  } catch (err) {
    logger.error('[support/create-session] Error', {
      traceId, error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
