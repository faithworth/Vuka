export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getPartnerCreatorQualifications, rateFromQualifications } from '@/lib/partners';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vukamusic.com';

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const partner = await prisma.partnerProfile.findUnique({ where: { userId: user.id } });
    if (!partner || !partner.isActive) return NextResponse.json({ error: 'Partner access is not enabled for this account.' }, { status: 403 });

    const qualifications = await getPartnerCreatorQualifications(partner.referralCode);
    const rate = rateFromQualifications(qualifications).rate;
    const referralCount = await prisma.user.count({
      where: { referredBy: partner.referralCode, role: { in: ['artist', 'producer'] }, artist: { isNot: null } },
    });
    const statements = await prisma.partnerMonthlyStatement.findMany({
      where: { partnerId: partner.id },
      orderBy: { periodStart: 'desc' },
      take: 24,
    });
    const payouts = await prisma.partnerPayout.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({
      partner: {
        id: partner.id,
        name: user.name,
        email: user.email,
        referralCode: partner.referralCode,
        referralLink: `${APP_URL}/auth/register?ref=${encodeURIComponent(partner.referralCode)}&role=artist`,
        paypalEmail: partner.paypalEmail ?? '',
        currentRate: rate,
        isActive: partner.isActive,
      },
      summary: {
        referredCreators: referralCount,
        qualifyingCreators: qualifications.filter(c => c.category !== 'none').length,
        activeSales: qualifications.filter(c => c.category === 'active_sales').length,
        paidOrSteady: qualifications.filter(c => c.category === 'paid_or_steady').length,
        strongSellers: qualifications.filter(c => c.category === 'strong_seller').length,
        estimatedRate: rate,
        totalStatementAmount: statements.reduce((sum, s) => sum + s.shareAmount, 0),
        paidAmount: payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
        pendingAmount: payouts.filter(p => p.status !== 'paid' && p.status !== 'rejected').reduce((sum, p) => sum + p.amount, 0),
      },
      creators: qualifications,
      statements,
      payouts,
    });
  } catch (error) {
    console.error('[partner/dashboard GET]', error);
    return NextResponse.json({ error: 'Unable to load partner dashboard.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const partner = await prisma.partnerProfile.findUnique({ where: { userId: user.id } });
    if (!partner || !partner.isActive) return NextResponse.json({ error: 'Partner access is not enabled for this account.' }, { status: 403 });
    const body = await req.json();
    const paypalEmail = String(body.paypalEmail ?? '').trim().toLowerCase();
    if (paypalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
      return NextResponse.json({ error: 'Enter a valid PayPal email address.' }, { status: 400 });
    }
    const updated = await prisma.partnerProfile.update({
      where: { id: partner.id },
      data: { paypalEmail: paypalEmail || null },
      select: { paypalEmail: true },
    });
    await prisma.partnerPayout.updateMany({
      where: { partnerId: partner.id, status: { in: ['pending', 'approved'] } },
      data: { destination: updated.paypalEmail || '' },
    });
    return NextResponse.json({ ok: true, paypalEmail: updated.paypalEmail ?? '' });
  } catch (error) {
    console.error('[partner/dashboard PATCH]', error);
    return NextResponse.json({ error: 'Unable to save payout details.' }, { status: 500 });
  }
}
