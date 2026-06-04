/**
 * POST /api/auth/heal-purchases
 *
 * One-call self-heal: finds all confirmed purchases where buyerEmail matches
 * the logged-in user's email but userId is null, and links them to the account.
 *
 * Safe to call multiple times — idempotent.
 * Called automatically from the fan library page on first load.
 */
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Find all confirmed/pending purchases by email with no userId
    const result = await prisma.purchase.updateMany({
      where: {
        buyerEmail: user.email!,
        userId: null,
      },
      data: { userId: user.id },
    });

    return NextResponse.json({ ok: true, linked: result.count });
  } catch (err) {
    console.error('[heal-purchases]', err);
    return NextResponse.json({ ok: false, linked: 0 });
  }
}
