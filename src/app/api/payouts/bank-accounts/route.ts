// src/app/api/payouts/bank-accounts/route.ts
// GET    — list artist's saved bank accounts (masked display only)
// POST   — add a new bank account (account number encrypted at rest)
// DELETE ?id=xxx — remove a bank account
//
// Phase 8: account number is NEVER stored in plaintext.
//   - On POST: encrypt with AES-256-CBC + HMAC (lib/encryption.ts)
//   - On GET:  only maskedNumber and safe display fields are returned
//   - On admin payout processing: decrypt only in worker, never here

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { encrypt, maskAccountNumber } from '@/lib/encryption';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { z } from 'zod';

// ── Validation schema ─────────────────────────────────────────

const SA_BANKS = [
  'ABSA', 'African Bank', 'Bidvest Bank', 'Capitec', 'Discovery Bank',
  'FNB', 'Grindrod Bank', 'Investec', 'Nedbank', 'Standard Bank',
  'TymeBank', 'Old Mutual', 'Sasfin', 'Ubank', 'Other',
] as const;

const addBankAccountSchema = z.object({
  accountHolder: z.string()
    .min(2, 'Account holder name too short')
    .max(100, 'Account holder name too long')
    .trim(),
  bankName: z.string()
    .min(2, 'Bank name required')
    .max(60)
    .trim(),
  branchCode: z.string()
    .max(10)
    .trim()
    .optional()
    .default(''),
  accountNumber: z.string()
    .min(6, 'Account number too short')
    .max(20, 'Account number too long')
    .regex(/^\d+$/, 'Account number must be digits only')
    .trim(),
  accountType: z.enum(['current', 'savings', 'transmission', 'credit']).default('current'),
  isDefault: z.boolean().default(false),
});

// ── GET — list accounts (safe display fields only) ────────────

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await prisma.artistBankAccount.findMany({
      where: { artistId: user.artist.id },
      select: {
        id: true,
        bankName: true,
        maskedNumber: true,   // "****1234" — never expose accountNumber
        accountHolder: true,
        accountType: true,
        branchCode: true,
        isDefault: true,
        isVerified: true,
        createdAt: true,
        // accountNumber field is NEVER selected — encrypted blob stays in DB
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ accounts });
  } catch (err) {
    console.error('[bank-accounts/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST — add a bank account (encrypt account number) ────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.api_general, ip);
    if (limited) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Parse + validate
    const raw = await req.json();
    const parsed = addBankAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }

    const {
      accountHolder,
      bankName,
      branchCode,
      accountNumber,
      accountType,
      isDefault,
    } = parsed.data;

    // Encrypt the sensitive account number — ONLY the masked display version stored alongside
    let encryptedAccountNumber: string;
    try {
      encryptedAccountNumber = encrypt(accountNumber);
    } catch (encErr: any) {
      console.error('[bank-accounts/POST] Encryption failed:', encErr);
      // Surface the real reason so it's diagnosable
      return NextResponse.json(
        { error: `Encryption config error: ${encErr?.message ?? 'unknown'}` },
        { status: 500 }
      );
    }

    const maskedNumber = maskAccountNumber(accountNumber);

    // If marked default, clear other defaults first (atomic within transaction)
    await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.artistBankAccount.updateMany({
          where: { artistId: user.artist!.id },
          data: { isDefault: false },
        });
      }

      const existingCount = await tx.artistBankAccount.count({
        where: { artistId: user.artist!.id },
      });

      return tx.artistBankAccount.create({
        data: {
          artistId: user.artist!.id,
          accountHolder: accountHolder.trim(),
          bankName: bankName.trim(),
          branchCode: branchCode?.trim() ?? '',
          accountNumber: encryptedAccountNumber,  // encrypted
          maskedNumber,                            // "****1234"
          accountType,
          isDefault: isDefault || existingCount === 0,
          isVerified: false,
        },
      });
    });

    // Re-fetch with safe select so we never accidentally return accountNumber
    const created = await prisma.artistBankAccount.findFirst({
      where: { artistId: user.artist.id, maskedNumber },
      select: {
        id: true,
        bankName: true,
        maskedNumber: true,
        accountHolder: true,
        accountType: true,
        branchCode: true,
        isDefault: true,
        isVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ account: created }, { status: 201 });
  } catch (err: any) {
    console.error('[bank-accounts/POST]', err);
    const message = err?.message ?? err?.code ?? String(err) ?? 'unknown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — remove a bank account ────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Verify ownership before delete
    const account = await prisma.artistBankAccount.findFirst({
      where: { id, artistId: user.artist.id },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Block deletion if there's a pending payout referencing this account
    const pendingPayout = await prisma.payoutRequest.findFirst({
      where: { bankAccountId: id, status: { in: ['pending', 'approved'] } },
    });
    if (pendingPayout) {
      return NextResponse.json(
        { error: 'Cannot remove account with a pending payout request' },
        { status: 409 }
      );
    }

    await prisma.artistBankAccount.delete({ where: { id } });

    // Promote the next account to default if needed
    if (account.isDefault) {
      const next = await prisma.artistBankAccount.findFirst({
        where: { artistId: user.artist.id },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await prisma.artistBankAccount.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bank-accounts/DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
