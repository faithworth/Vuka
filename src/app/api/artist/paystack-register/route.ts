import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase';

/**
 * POST /api/artist/paystack-register
 * Artist saves their Paystack recipient details for payouts.
 * Replaces /api/artist/payfast-register.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { bankCode, accountNumber, accountName } = body;

    if (!bankCode || !accountNumber || !accountName) {
      return NextResponse.json({ error: 'bankCode, accountNumber, and accountName are required' }, { status: 400 });
    }

    const artist = await prisma.artist.findUnique({ where: { userId: user.id } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    // Store bank details for manual payout processing
    // paystackRecipient column reused to store accountNumber for schema compat
    const updated = await prisma.artist.update({
      where: { id: artist.id },
      data:  { paystackRecipient: accountNumber },
    });

    return NextResponse.json({
      success:       true,
      message:       'Bank account registered for Paystack payouts',
      artistId:      artist.id,
      accountNumber: updated.paystackRecipient,
      instructions:  'Your bank account is saved. Payouts are processed manually within 2–5 business days after each withdrawal request.',
    });
  } catch (err) {
    console.error('[paystack-register] error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
