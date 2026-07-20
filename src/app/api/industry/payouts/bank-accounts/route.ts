// src/app/api/industry/payouts/bank-accounts/route.ts
// Mirrors src/app/api/payouts/bank-accounts/route.ts (artist) for industry users.
// GET    — list industry user's saved bank accounts (masked display only)
// POST   — add a new bank account (account number encrypted at rest)
// DELETE ?id=xxx — remove a bank account
//
// Same security model as the artist route: account number is NEVER stored
// in plaintext (AES-256-CBC + HMAC via lib/encryption.ts), only maskedNumber
// is ever returned, and new accounts get a 48h eligibility cooldown.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireIndustry } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { encrypt, maskAccountNumber } from '@/lib/encryption';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { z } from 'zod';

// ── Validation schema ─────────────────────────────────────────

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
    const user = await requireIndustry();
    if (!user?.industryUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await prisma.industryBankAccount.findMany({
      where: { industryUserId: user.industryUser.id },
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
    console.error('[industry/bank-accounts/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST — add a bank account (encrypt account number) ────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireIndustry();
    if (!user?.industryUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.bank_account_add, ip);
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
      console.error('[industry/bank-accounts/POST] Encryption failed:', encErr);
      return NextResponse.json(
        { error: `Encryption config error: ${encErr?.message ?? 'unknown'}` },
        { status: 500 }
      );
    }

    const maskedNumber = maskAccountNumber(accountNumber);

    // If marked default, clear other defaults first (atomic within transaction)
    await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.industryBankAccount.updateMany({
          where: { industryUserId: user.industryUser!.id },
          data: { isDefault: false },
        });
      }

      const existingCount = await tx.industryBankAccount.count({
        where: { industryUserId: user.industryUser!.id },
      });

      return tx.industryBankAccount.create({
        data: {
          industryUserId: user.industryUser!.id,
          accountHolder: accountHolder.trim(),
          bankName: bankName.trim(),
          branchCode: branchCode?.trim() ?? '',
          accountNumber: encryptedAccountNumber,  // encrypted
          maskedNumber,                            // "****1234"
          accountType,
          isDefault: isDefault || existingCount === 0,
          isVerified: false,
          eligibleForPayoutAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
    });

    // Re-fetch with safe select so we never accidentally return accountNumber
    const created = await prisma.industryBankAccount.findFirst({
      where: { industryUserId: user.industryUser.id, maskedNumber },
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
    console.error('[industry/bank-accounts/POST]', err);
    const message = err?.message ?? err?.code ?? String(err) ?? 'unknown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — remove a bank account ────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireIndustry();
    if (!user?.industryUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Verify ownership before delete
    const account = await prisma.industryBankAccount.findFirst({
      where: { id, industryUserId: user.industryUser.id },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Block deletion if there's a pending payout referencing this account
    const pendingPayout = await prisma.industryPayoutRequest.findFirst({
      where: { bankAccountId: id, status: { in: ['pending', 'approved'] } },
    });
    if (pendingPayout) {
      return NextResponse.json(
        { error: 'Cannot remove account with a pending payout request' },
        { status: 409 }
      );
    }

    await prisma.industryBankAccount.delete({ where: { id } });

    // Promote the next account to default if needed
    if (account.isDefault) {
      const next = await prisma.industryBankAccount.findFirst({
        where: { industryUserId: user.industryUser.id },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await prisma.industryBankAccount.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[industry/bank-accounts/DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
