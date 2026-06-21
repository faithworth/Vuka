export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const expired = await prisma.campaign.findMany({
    where: { deadline: { lt: now }, status: 'active' },
    include: { backers: { where: { status: 'confirmed' } } },
  });

  let funded = 0, failed = 0, errors: string[] = [];

  for (const c of expired) {
    try {
      if (c.campaignType === 'all_or_nothing' && c.currentAmount < c.targetAmount) {
        // Mark failed — refunds triggered per backer via Paystack refund API
        await prisma.campaign.update({ where: { id: c.id }, data: { status: 'failed' } });
        // Queue refunds — fire-and-forget per backer
        for (const backer of c.backers) {
          if (backer.paystackReference) {
            fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/paystack/refund`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
              body: JSON.stringify({ reference: backer.paystackReference, amount: backer.amount * 100 }),
            }).catch(() => {});
          }
        }
        failed++;
      } else {
        // Flexible or fully-funded all-or-nothing — mark funded
        await prisma.campaign.update({ where: { id: c.id }, data: { status: 'funded' } });
        funded++;
      }
    } catch (e) {
      errors.push(c.id);
    }
  }
  return NextResponse.json({ ok: true, processed: expired.length, funded, failed, errors });
}
