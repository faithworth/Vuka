// GET  /api/dashboard/referrals — artist's referral stats + unique link
// POST /api/dashboard/referrals — generate referral code if missing

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

const REWARD_THRESHOLD = 5; // referrals needed to earn 3 months Pro
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vuka.co.za';

function generateCode(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user has a referral code
    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = generateCode(user.name);
      // Ensure uniqueness
      let attempts = 0;
      while (await prisma.user.findUnique({ where: { referralCode } }) && attempts < 5) {
        referralCode = generateCode(user.name);
        attempts++;
      }
      await prisma.user.update({
        where: { id: user.id },
        data:  { referralCode },
      });
    }

    // Count signups through this code
    const referralCount = await prisma.user.count({
      where: { referredBy: referralCode },
    });

    // Check if reward already claimed
    const rewardGranted = await prisma.referralReward.findFirst({
      where: { userId: user.id, rewardType: 'pro_3months' },
    });

    // Founding artist status
    const isFoundingArtist = user.artist.isFoundingArtist ?? false;

    const referralLink = `${APP_URL}/register?ref=${referralCode}`;

    return NextResponse.json({
      referralCode,
      referralLink,
      referralCount,
      threshold:      REWARD_THRESHOLD,
      rewardEarned:   referralCount >= REWARD_THRESHOLD,
      rewardClaimed:  !!rewardGranted,
      isFoundingArtist,
      progress: {
        current: Math.min(referralCount, REWARD_THRESHOLD),
        needed:  REWARD_THRESHOLD,
        pct:     Math.min(100, Math.round((referralCount / REWARD_THRESHOLD) * 100)),
      },
    });
  } catch (err) {
    console.error('[referrals/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST — trigger reward check manually (also called by cron)
export async function POST() {
  try {
    const user = await requireArtist();
    if (!user?.artist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const referralCode = user.referralCode;
    if (!referralCode) {
      return NextResponse.json({ ok: false, reason: 'no_referral_code' });
    }

    const referralCount = await prisma.user.count({
      where: { referredBy: referralCode },
    });

    if (referralCount < REWARD_THRESHOLD) {
      return NextResponse.json({
        ok: false,
        reason: 'threshold_not_met',
        current: referralCount,
        needed: REWARD_THRESHOLD,
      });
    }

    // Check if already rewarded
    const existing = await prisma.referralReward.findFirst({
      where: { userId: user.id, rewardType: 'pro_3months' },
    });
    if (existing) {
      return NextResponse.json({ ok: false, reason: 'already_rewarded' });
    }

    // Grant 3 months Pro
    const newExpiry = new Date();
    const currentExpiry = user.artist.planExpiresAt;
    if (currentExpiry && currentExpiry > new Date()) {
      // Extend existing Pro plan
      newExpiry.setTime(currentExpiry.getTime());
    }
    newExpiry.setMonth(newExpiry.getMonth() + 3);

    await prisma.$transaction([
      prisma.artist.update({
        where: { id: user.artist.id },
        data:  { planSlug: 'pro', planExpiresAt: newExpiry },
      }),
      prisma.referralReward.create({
        data: { id: `rr_${Date.now()}`, userId: user.id, rewardType: 'pro_3months' },
      }),
    ]);

    return NextResponse.json({ ok: true, proUntil: newExpiry });
  } catch (err) {
    console.error('[referrals/POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
