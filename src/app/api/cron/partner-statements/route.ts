export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createPartnerMonthlyStatement } from '@/lib/partners';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  // On the 10th, issue the previous calendar month. Cron schedule is 08:00 UTC
  // (10:00 South Africa time), matching the agreement's statement deadline.
  try {
    const partners = await prisma.partnerProfile.findMany({
      where: { isActive: true },
      select: { id: true, paypalEmail: true },
    });
    let issued = 0;
    let drafts = 0;
    let payoutsCreated = 0;
    for (const partner of partners) {
      const statement = await createPartnerMonthlyStatement(partner.id, year, month);
      if (statement.status === 'draft') drafts++;
      if (statement.status === 'issued') issued++;
      if (statement.status === 'issued' && statement.shareAmount > 0) {
        const existing = await prisma.partnerPayout.findFirst({
          where: { statementId: statement.id, status: { notIn: ['paid', 'rejected'] } },
        });
        if (existing) {
          await prisma.partnerPayout.update({
            where: { id: existing.id },
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
              destination: partner.paypalEmail || '',
              status: 'pending',
              adminNotes: partner.paypalEmail
                ? 'Pending manual payment to the saved partner PayPal destination.'
                : 'Pending: partner must save a PayPal destination before payment.',
            },
          });
          payoutsCreated++;
        }
      }
    }
    return NextResponse.json({ ok: true, period: `${year}-${String(month).padStart(2, '0')}`, partners: partners.length, issued, drafts, payoutsCreated });
  } catch (error) {
    console.error('[cron/partner-statements]', error);
    return NextResponse.json({ error: 'Partner statement run failed.' }, { status: 500 });
  }
}
