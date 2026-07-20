import { NextRequest, NextResponse } from 'next/server';

// DISABLED — do not re-enable without a full rewrite.
//
// This route stored the artist's bank account number in PLAINTEXT on
// Artist.paystackRecipient (a repurposed column), completely bypassing the
// real encrypted flow that /api/payouts/bank-accounts uses for the exact
// same data (ArtistBankAccount.accountNumber, encrypted at rest, masked in
// responses). Even though this route was session-authenticated, storing
// unencrypted bank account numbers is a real data-exposure risk.
//
// Real bank-account collection goes through POST /api/payouts/bank-accounts.
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Use /api/payouts/bank-accounts.' },
    { status: 410 },
  );
}
