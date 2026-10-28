export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createPartnerMonthlyStatement, getPartnerCreatorQualifications, rateFromQualifications } from '@/lib/partners';

function makePartnerCode(name: string) {
  const stem = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'partner';
  return `partner-${stem}-${randomBytes(3).toString('hex')}`;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const partnerId = new URL(req.url).searchParams.get('partnerId');
    if (partnerId) {
      const partner = await prisma.partnerProfile.findUnique({
        where: { id: partnerId },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          statements: { orderBy: { periodStart: 'desc' }, take: 24 },
          payouts: { orderBy: { createdAt: 'desc' }, take: 50 },
        },
      });
      if (!partner) return NextResponse.json({ error: 'Partner not found.' }, { status: 404 });
      const creators = await getPartnerCreatorQualifications(partner.referralCode);
      return NextResponse.json({ partner, creators, rate: rateFromQualifications(creators).rate });
    }
    const partners = await prisma.partnerProfile.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
        statements: { orderBy: { periodStart: 'desc' }, take: 12 },
        payouts: { orderBy: { createdAt: 'desc' }, take: 12 },
      },
      orderBy: { createdAt: 'desc' },
    });
    const result: Array<(typeof partners)[number] & { currentRate: number; referredCreators: number; qualifyingCreators: number }> = [];
    for (const partner of partners) {
      const referredCreators = await prisma.user.count({
        where: { referredBy: partner.referralCode, role: { in: ['artist', 'producer'] }, artist: { isNot: null } },
      });
      const qualifications = await getPartnerCreatorQualifications(partner.referralCode);
      const currentRate = rateFromQualifications(qualifications).rate;
      result.push({ ...partner, currentRate, referredCreators, qualifyingCreators: qualifications.filter(c => c.category !== 'none').length });
    }
    return NextResponse.json({ partners: result });
  } catch (error) {
    console.error('[admin/partners GET]', error);
    return NextResponse.json({ error: 'Unable to load partners.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const action = String(body.action ?? '');

    if (action === 'exclude_creator' || action === 'restore_creator') {
      const partnerId = String(body.partnerId ?? '');
      const referredUserId = String(body.referredUserId ?? '');
      const reason = String(body.reason ?? '').trim();
      if (!partnerId || !referredUserId) return NextResponse.json({ error: 'Partner and creator IDs are required.' }, { status: 400 });
      const partner = await prisma.partnerProfile.findUnique({ where: { id: partnerId } });
      if (!partner) return NextResponse.json({ error: 'Partner not found.' }, { status: 404 });
      const referredUser = await prisma.user.findUnique({ where: { id: referredUserId }, select: { id: true, referredBy: true, role: true, artist: { select: { id: true } } } });
      if (!referredUser || referredUser.referredBy !== partner.referralCode || !['artist', 'producer'].includes(referredUser.role) || !referredUser.artist) {
        return NextResponse.json({ error: 'Creator is not an eligible artist/producer referral for this partner.' }, { status: 400 });
      }
      if (action === 'exclude_creator') {
        if (reason.length < 5) return NextResponse.json({ error: 'Provide a clear exclusion reason (at least 5 characters).' }, { status: 400 });
        const now = new Date();
        const effectiveFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        await prisma.partnerCreatorExclusion.upsert({
          where: { partnerId_referredUserId: { partnerId, referredUserId } },
          create: { partnerId, referredUserId, createdByUserId: admin.id, reason, effectiveFrom },
          update: { createdByUserId: admin.id, reason, effectiveFrom },
        });
      } else {
        await prisma.partnerCreatorExclusion.deleteMany({ where: { partnerId, referredUserId } });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_self') {
      const existing = await prisma.partnerProfile.findUnique({ where: { userId: admin.id } });
      if (existing) return NextResponse.json({ error: 'Your account already has a partner profile.' }, { status: 409 });
      const referralCode = makePartnerCode(admin.name);
      const partner = await prisma.partnerProfile.create({
        data: { userId: admin.id, referralCode },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });
      return NextResponse.json({ ok: true, partner });
    }

    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Enter the email of an existing Vuka account.' }, { status: 400 });
      }
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return NextResponse.json({ error: 'That user must create a Vuka account before partner access can be assigned.' }, { status: 404 });
      const existing = await prisma.partnerProfile.findUnique({ where: { userId: user.id } });
      if (existing) return NextResponse.json({ error: 'This user already has a partner profile.' }, { status: 409 });
      const referralCode = makePartnerCode(user.name);
      const partner = await prisma.partnerProfile.create({
        data: { userId: user.id, referralCode },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });
      return NextResponse.json({ ok: true, partner });
    }

    if (action === 'issue_statements') {
      const period = String(body.period ?? '');
      const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
      if (!match) return NextResponse.json({ error: 'Choose a month in YYYY-MM format.' }, { status: 400 });
      const year = Number(match[1]);
      const month = Number(match[2]);
      const partners = await prisma.partnerProfile.findMany({ where: { isActive: true }, select: { id: true, paypalEmail: true } });
      const statements: Array<Awaited<ReturnType<typeof createPartnerMonthlyStatement>>> = [];
      for (const partner of partners) {
        const statement = await createPartnerMonthlyStatement(partner.id, year, month);
        statements.push(statement);
        if (statement.status === 'issued' && statement.shareAmount > 0) {
          const existingPayout = await prisma.partnerPayout.findFirst({
            where: { statementId: statement.id, status: { notIn: ['paid', 'rejected'] } },
          });
          if (existingPayout) {
            await prisma.partnerPayout.update({
              where: { id: existingPayout.id },
              data: {
                amount: statement.shareAmount,
                destination: partner.paypalEmail || '',
                adminNotes: partner.paypalEmail
                  ? 'Pending manual payment to the saved partner PayPal destination.'
                  : 'Pending: partner must save a PayPal destination before payment.',
              },
            });
          } else {
            await prisma.partnerPayout.create({
              data: {
                partnerId: partner.id,
                statementId: statement.id,
                amount: statement.shareAmount,
                method: 'paypal',
                status: 'pending',
                destination: partner.paypalEmail || '',
                adminNotes: partner.paypalEmail
                  ? 'Pending manual payment to the saved partner PayPal destination.'
                  : 'Pending: partner must save a PayPal destination before payment.',
              },
            });
          }
        }
      }
      return NextResponse.json({
        ok: true,
        generated: statements.length,
        drafts: statements.filter(s => s.status === 'draft').length,
        statements,
      });
    }

    if (action === 'mark_payout_paid') {
      const payoutId = String(body.payoutId ?? '');
      const reference = String(body.reference ?? '').trim();
      if (!payoutId || !reference) return NextResponse.json({ error: 'Payout ID and payment reference are required.' }, { status: 400 });
      const payout = await prisma.partnerPayout.findUnique({
        where: { id: payoutId },
        include: { statement: true, partner: { select: { paypalEmail: true } } },
      });
      if (!payout) return NextResponse.json({ error: 'Payout not found.' }, { status: 404 });
      if (payout.status === 'paid') return NextResponse.json({ error: 'Payout is already marked paid.' }, { status: 409 });
      if (!payout.destination || !payout.partner.paypalEmail) return NextResponse.json({ error: 'Partner must save a valid PayPal destination before payout.' }, { status: 409 });
      if (payout.statement && (payout.statement.status !== 'issued' || payout.statement.unknownProcessorFeeRows > 0 || payout.statement.unknownPlatformFeeRows > 0)) {
        return NextResponse.json({ error: 'This statement is not reconciled and issued yet; do not pay it.' }, { status: 409 });
      }
      await prisma.$transaction(async tx => {
        await tx.partnerPayout.update({
          where: { id: payoutId },
          data: { status: 'paid', reference, paidAt: new Date(), adminNotes: 'Marked paid by admin after manual payment.' },
        });
        if (payout.statementId) {
          await tx.partnerMonthlyStatement.update({
            where: { id: payout.statementId },
            data: { status: 'paid', paidAt: new Date() },
          });
        }
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'set_status') {
      const partnerId = String(body.partnerId ?? '');
      const isActive = Boolean(body.isActive);
      const partner = await prisma.partnerProfile.update({
        where: { id: partnerId },
        data: { isActive },
      });
      return NextResponse.json({ ok: true, partner });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error('[admin/partners POST]', error);
    return NextResponse.json({ error: 'Unable to complete partner action.' }, { status: 500 });
  }
}
