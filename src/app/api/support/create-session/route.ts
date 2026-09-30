--- src/app/api/support/create-session/route.ts (sha: c54df4abcfbc868c03a4198a50a8d9d876208ac5) ---

/**
 * POST /api/support/create-session
 * Paystack support/tip payments — replaces PayFast form-POST flow.
 * On charge.success → /api/support/webhook delivers value.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { initializeTransaction, generateReference } from '@/lib/paystack';
import { createYocoCheckout, generateReference as generateYocoReference } from '@/lib/yoco';
import { logger } from '@/lib/logger';
import { schemas, validationError } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? 'no-trace';

  try {
    const raw = await req.json();
    const parsed = schemas.support.create.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const { artistSlug, amount, message, fanName, fanEmail, isPublic, tier } = parsed.data;

    const artist = await prisma.artist.findUnique({ where: { slug: artistSlug }, include: { user: true } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const txn = await prisma.supportTxn.create({
      data: {
        fanEmail, fanName,
        artistId: artist.id,
        amount,
        currency: artist.currency || 'ZAR',
        message:  message || '',
        tier:     tier || 'Listener',
        isPublic: isPublic !== false,
        status:   'pending',
      },
    });

    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const reference = generateReference('SUP');

    try {
      const result = await initializeTransaction({
        email:       fanEmail,
        amountZAR:   amount,
        reference,
        callbackUrl: `${appUrl}/support/${artistSlug}?success=1&txnId=${txn.id}`,
        metadata: {
          txnId:    txn.id,
          artistId: artist.id,
          tier:     tier || 'Listener',
          type:     'support',
        },
      });

      await prisma.supportTxn.update({
        where: { id: txn.id },
        data:  { paystackReference: reference },
      });

      logger.info('[support/create-session] Paystack initialized', { traceId, txnId: txn.id, amount, reference });
      return NextResponse.json({ authorizationUrl: result.authorizationUrl, method: 'paystack' });
    } catch (paystackErr) {
      logger.warn('[support/create-session] Paystack unavailable; falling back to Yoco', {
        traceId,
        txnId: txn.id,
        error: paystackErr instanceof Error ? paystackErr.message : String(paystackErr),
      });

      const yocoReference = generateYocoReference('SUPY');
      const checkout = await createYocoCheckout({
        amountZAR: amount,
        currency: 'ZAR',
        reference: yocoReference,
        successUrl: `${appUrl}/support/${artistSlug}?success=1&txnId=${txn.id}`,
        cancelUrl: `${appUrl}/support/${artistSlug}?cancelled=1`,
        failureUrl: `${appUrl}/support/${artistSlug}?failed=1`,
        metadata: {
          txnId: txn.id,
          artistId: artist.id,
          tier: tier || 'Listener',
          type: 'support',
        },
      });

      await prisma.supportTxn.update({
        where: { id: txn.id },
        data: { paystackReference: yocoReference },
      });

      logger.info('[support/create-session] Yoco fallback initialized', { traceId, txnId: txn.id, amount, reference: yocoReference, checkoutId: checkout.checkoutId });
      return NextResponse.json({ authorizationUrl: checkout.redirectUrl, method: 'yoco' });
    }

  } catch (err) {
    logger.error('[support/create-session] Error', { traceId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}