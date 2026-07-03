export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { initializeTransaction } from '@/lib/paystack';

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  const body = await req.json();
  const { campaignId, tierId, backerName, backerEmail, amount, anonymous, message } = body;
  if (!campaignId || !backerName || !backerEmail || !amount)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  const amtNum = parseFloat(amount);
  if (amtNum < 10) return NextResponse.json({ error: 'Minimum backing amount is R10' }, { status: 400 });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== 'active')
    return NextResponse.json({ error: 'Campaign not available' }, { status: 400 });
  if (new Date(campaign.deadline) < new Date())
    return NextResponse.json({ error: 'Campaign deadline has passed' }, { status: 400 });
  if (tierId) {
    const tier = await prisma.campaignTier.findUnique({ where: { id: tierId } });
    if (!tier) return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    if (tier.maxBackers) {
      const count = await prisma.campaignBacker.count({ where: { tierId, status: 'confirmed' } });
      if (count >= tier.maxBackers) return NextResponse.json({ error: 'This tier is full' }, { status: 400 });
    }
  }
  const backer = await prisma.campaignBacker.create({
    data: {
      campaignId, tierId: tierId ?? null,
      userId: user?.id ?? null, backerName, backerEmail,
      amount: amtNum, currency: 'ZAR', status: 'pending',
      anonymous: anonymous ?? false, message: message ?? '',
    },
  });
  const ref = `campaign_${backer.id}`;
  // FIX: paystackReference was never persisted — same bug as event tickets.
  // Without it the webhook can never locate this pledge, so it stays
  // 'pending' forever even after the fan is successfully charged.
  await prisma.campaignBacker.update({ where: { id: backer.id }, data: { paystackReference: ref } });
  const ps = await initializeTransaction({
    email: backerEmail, amountZAR: amtNum * 100 / 100, reference: ref, metadata: { type: 'campaign_backing', backerId: backer.id, campaignId }, callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/campaigns/${campaign.slug}?backed=1`,
  });
  if (!ps.authorizationUrl) return NextResponse.json({ error: 'Payment init failed' }, { status: 500 });
  return NextResponse.json({ ok: true, authorizationUrl: ps.authorizationUrl });
}
