// GET /api/cron/referral-rewards
// Scans all artists who haven't been rewarded yet and auto-grants
// 3 months Pro when their referral count hits the threshold.
//
// Call from Vercel Cron or a daily job:
//   Schedule: 0 2 * * * (daily at 02:00 SAST)
//   Authorization: CRON_SECRET header

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const REWARD_THRESHOLD = 5;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find users with referral codes who haven't been rewarded yet
    const unrewardedUsers = await prisma.user.findMany({
      where: {
        referralCode: { not: null },
        referralRewards: { none: { rewardType: 'pro_3months' } },
        artist: { isNot: null },
      },
      select: {
        id: true,
        referralCode: true,
        artist: {
          select: { id: true, planSlug: true, planExpiresAt: true },
        },
      },
    });

    let rewarded = 0;
    const errors: string[] = [];

    for (const user of unrewardedUsers) {
      if (!user.referralCode || !user.artist) continue;

      const count = await prisma.user.count({
        where: { referredBy: user.referralCode },
      });

      if (count < REWARD_THRESHOLD) continue;

      try {
        const newExpiry = new Date();
        const currentExpiry = user.artist.planExpiresAt;
        if (currentExpiry && currentExpiry > new Date()) {
          newExpiry.setTime(currentExpiry.getTime());
        }
        newExpiry.setMonth(newExpiry.getMonth() + 3);

        await prisma.$transaction([
          prisma.artist.update({
            where: { id: user.artist.id },
            data:  { planSlug: 'pro', planExpiresAt: newExpiry },
          }),
          prisma.referralReward.create({
            data: { id: `rr_${user.id}_${Date.now()}`, userId: user.id, rewardType: 'pro_3months' },
          }),
        ]);

        rewarded++;
        console.log(`[referral-cron] Rewarded user ${user.id} — ${count} referrals`);
      } catch (err) {
        console.error(`[referral-cron] Failed for user ${user.id}:`, err);
        errors.push(user.id);
      }
    }

    return NextResponse.json({
      ok: true,
      checked: unrewardedUsers.length,
      rewarded,
      errors,
    });
  } catch (err) {
    console.error('[referral-cron]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
