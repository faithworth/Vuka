// ============================================================
// src/app/api/plans/cancel/route.ts
// Artist cancels their Pro/Label plan subscription.
// Access continues until planExpiresAt; then drops to Free via cron.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export async function POST() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { planSlug: true, planExpiresAt: true },
    });

    if (!artist || artist.planSlug === 'free') {
      return NextResponse.json({ error: 'No active paid plan' }, { status: 400 });
    }

    // Mark latest active subscription as cancelled
    const activeSub = await (prisma as any).artistPlanSubscription.findFirst({
      where: { artistId: user.artist.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (activeSub) {
      await (prisma as any).artistPlanSubscription.update({
        where: { id: activeSub.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
    }

    // Do NOT clear planSlug yet — let them keep access until planExpiresAt
    // The /api/cron/expire-plans cron will drop them to Free when the date passes.

    await auditLog.adminAction(
      'plan.cancelled',
      'Artist',
      user.artist.id,
      user.id,
      `Cancelled plan ${artist.planSlug}. Access until ${artist.planExpiresAt?.toISOString() ?? 'unknown'}`,
    );

    return NextResponse.json({
      ok: true,
      message: `Your ${artist.planSlug} plan has been cancelled. You'll keep access until ${artist.planExpiresAt ? new Date(artist.planExpiresAt).toLocaleDateString('en-ZA') : 'the end of your billing period'}.`,
      expiresAt: artist.planExpiresAt,
    });
  } catch (err: any) {
    console.error('[plans/cancel] error:', err?.message);
    return NextResponse.json({ error: 'Failed to cancel plan' }, { status: 500 });
  }
}
