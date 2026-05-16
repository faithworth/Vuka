import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase';

/**
 * POST /api/artist/payfast-register
 * Artist registers their PayFast merchant ID for direct payouts
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { merchantId, email, displayName } = body;

    if (!merchantId || !email) {
      return NextResponse.json({
        error: 'Merchant ID and email are required',
      }, { status: 400 });
    }

    // Validate merchant ID format (should be numeric)
    if (!/^\d+$/.test(merchantId)) {
      return NextResponse.json({
        error: 'Invalid PayFast Merchant ID. Must be numeric.',
      }, { status: 400 });
    }

    const artist = await prisma.artist.findUnique({
      where: { userId: user.id },
    });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Update artist with PayFast merchant details
    const updated = await prisma.artist.update({
      where: { id: artist.id },
      data: {
        payfastMerchant: merchantId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'PayFast merchant ID registered',
      artistId: artist.id,
      artistName: artist.name,
      payfastMerchant: updated.payfastMerchant,
      instructions: 'You can now receive direct payouts to your bank account via PayFast. Earnings will be transferred within 24-48 hours after each sale.',
    });
  } catch (err) {
    console.error('PayFast registration error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
