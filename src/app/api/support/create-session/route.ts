/**
 * POST /api/support/create-session
 * Paystack support/tip payments — replaces PayFast form-POST flow.
 * On charge.success → /api/support/webhook delivers value.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { initializeTransaction, generateReference } from '@/lib/paystack';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? 'no-trace';

  try {
    const { artistSlug, amount, message, fanName, fanEmail, isPublic, tier } = await req.json();

    if (!artistSlug || !amount || !fanEmail || !fanName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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

    // Store reference so webhook can look up the txn
    await prisma.supportTxn.update({
      where: { id: txn.id },
      data:  { paystackReference: reference },
    });

    logger.info('[support/create-session] Initialized', { traceId, txnId: txn.id, amount, reference });

    return NextResponse.json({ authorizationUrl: result.authorizationUrl, method: 'paystack' });

  } catch (err) {
    logger.error('[support/create-session] Error', { traceId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
