import { NextRequest, NextResponse } from 'next/server';

// DISABLED — do not re-enable without a full rewrite.
//
// This route was completely unauthenticated and accepted an arbitrary
// attacker-supplied `role` field (including 'artist'/'producer'), creating
// User/Artist rows directly in Postgres without ever touching Supabase
// auth. Any account created here would be permanently broken (nobody could
// actually log into it), and it had zero references anywhere in the
// frontend — confirmed by a full grep of src/.
//
// Real registration goes through POST /api/auth/register, which is
// Supabase-backed, validated, and rate-limited.
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'This endpoint has been removed. Use /api/auth/register.' },
    { status: 410 },
  );
}
