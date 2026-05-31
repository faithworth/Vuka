// src/app/api/payouts/bank-accounts/route.ts
// GET  — list artist's saved bank accounts
// POST — add a new SA bank account
// DELETE ?id=xxx — remove a bank account

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

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
        maskedNumber: true,
        accountHolder: true,
        accountType: true,
        branchCode: true,
        isDefault: true,
        isVerified: true,
        createdAt: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ accounts });
  } catch (err) {
    console.error('[bank-accounts/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      accountHolder,
      bankName,
      branchCode,
      accountNumber,
      accountType = 'current',
      isDefault = false,
    } = body as {
      accountHolder: string;
      bankName: string;
      branchCode?: string;
      accountNumber: string;
      accountType?: string;
      isDefault?: boolean;
    };

    if (!accountHolder?.trim()) {
      return NextResponse.json({ error: 'Account holder name is required' }, { status: 400 });
    }
    if (!bankName?.trim()) {
      return NextResponse.json({ error: 'Bank name is required' }, { status: 400 });
    }
    if (!accountNumber?.trim() || accountNumber.length < 6) {
      return NextResponse.json({ error: 'Valid account number is required' }, { status: 400 });
    }

    // Mask account number — only store last 4 digits visible
    const maskedNumber = `****${accountNumber.slice(-4)}`;

    // If this is set as default, unset others first
    if (isDefault) {
      await prisma.artistBankAccount.updateMany({
        where: { artistId: user.artist.id },
        data: { isDefault: false },
      });
    }

    // Check if this is their first account (auto-default)
    const existingCount = await prisma.artistBankAccount.count({
      where: { artistId: user.artist.id },
    });

    const account = await prisma.artistBankAccount.create({
      data: {
        artistId: user.artist.id,
        accountHolder: accountHolder.trim(),
        bankName: bankName.trim(),
        branchCode: branchCode?.trim() ?? '',
        // Store encrypted or hashed in production; for now store masked only
        maskedNumber,
        accountType,
        isDefault: isDefault || existingCount === 0,
        isVerified: false, // Admin must verify manually
      },
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
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error('[bank-accounts/POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

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

    // Verify ownership
    const account = await prisma.artistBankAccount.findFirst({
      where: { id, artistId: user.artist.id },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await prisma.artistBankAccount.delete({ where: { id } });

    // If we deleted the default, promote the next account
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
