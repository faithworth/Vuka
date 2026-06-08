// TEMPORARY DIAGNOSTIC ROUTE — DELETE AFTER FIXING
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { requireArtist } from '@/lib/auth';

export async function GET() {
  const results: Record<string, any> = {};

  // 1. Check env vars
  results.env = {
    ENCRYPTION_KEY_length: process.env.ENCRYPTION_KEY?.length ?? 'MISSING',
    HMAC_KEY_length: process.env.HMAC_KEY?.length ?? 'MISSING',
    DATABASE_URL_prefix: process.env.DATABASE_URL?.slice(0, 45) ?? 'MISSING',
    NODE_ENV: process.env.NODE_ENV,
  };

  // 2. Test encryption
  try {
    const enc = encrypt('test1234567890');
    results.encryption = { ok: true, sample: enc.slice(0, 20) + '...' };
  } catch (e: any) {
    results.encryption = { ok: false, error: e?.message };
  }

  // 3. Raw DB ping
  try {
    await prisma.$queryRaw`SELECT 1 as ping`;
    results.db_connection = { ok: true };
  } catch (e: any) {
    results.db_connection = { ok: false, error: e?.message };
  }

  // 4. User table
  try {
    const count = await prisma.user.count();
    results.user_table = { ok: true, count };
  } catch (e: any) {
    results.user_table = { ok: false, error: e?.message };
  }

  // 5. Artist table
  try {
    const count = await prisma.artist.count();
    results.artist_table = { ok: true, count };
  } catch (e: any) {
    results.artist_table = { ok: false, error: e?.message };
  }

  // 6. ArtistBankAccount table
  try {
    const count = await prisma.artistBankAccount.count();
    results.bank_account_table = { ok: true, count };
  } catch (e: any) {
    results.bank_account_table = { ok: false, error: e?.message };
  }

  // 7. SpamSignal table
  try {
    const count = await prisma.spamSignal.count();
    results.spam_signal_table = { ok: true, count };
  } catch (e: any) {
    results.spam_signal_table = { ok: false, error: e?.message };
  }

  // 8. Auth check
  try {
    const user = await requireArtist();
    results.auth = user
      ? { ok: true, userId: user.id, artistId: user.artist?.id }
      : { ok: false, error: 'requireArtist returned null — not logged in or no artist profile' };
  } catch (e: any) {
    results.auth = { ok: false, error: e?.message };
  }

  // 9. Bank insert test (uses fake artistId — should fail on FK, not on RLS)
  try {
    await prisma.artistBankAccount.create({
      data: {
        artistId: 'TEST_DELETE_ME_' + Date.now(),
        accountHolder: 'Test',
        bankName: 'Test Bank',
        branchCode: '000000',
        accountNumber: encrypt('1234567890'),
        maskedNumber: '****7890',
        accountType: 'current',
        isDefault: false,
        isVerified: false,
      },
    });
    results.bank_insert_test = { ok: false, error: 'Inserted with fake artistId — FK should have rejected this' };
  } catch (e: any) {
    const msg = e?.message ?? '';
    if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('fkey') || msg.includes('Foreign')) {
      results.bank_insert_test = { ok: true, note: 'DB insert works — correctly blocked by FK constraint on fake artistId' };
    } else {
      results.bank_insert_test = { ok: false, error: msg };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
