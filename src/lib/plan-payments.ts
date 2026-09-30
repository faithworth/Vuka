import prisma from '@/lib/prisma';
import { PLANS, addBillingPeriod, billingIntervalDbValue } from '@/lib/plans';

export async function activatePlanPayment(params: {
  artistId: string;
  planSlug: string;
  reference: string;
  amountZAR: number;
  currency: string;
  provider: 'paystack' | 'paypal' | 'yoco';
}) {
  const plan = PLANS.find(p => p.slug === params.planSlug);
  if (!plan || plan.priceZAR <= 0) throw new Error('Invalid paid plan');
  if (Math.abs(params.amountZAR - plan.priceZAR) > 0.01) throw new Error('Plan payment amount mismatch');

  const existing = await (prisma as any).artistPlanSubscription.findFirst({
    where: { paystackReference: params.reference },
  });
  if (existing) return { alreadyActive: true, subscription: existing };

  const now = new Date();
  const periodEnd = addBillingPeriod(now, plan.billingPeriod);

  const subscription = await prisma.$transaction(async tx => {
    await tx.artist.update({
      where: { id: params.artistId },
      data: { planSlug: plan.slug, planExpiresAt: periodEnd },
    });

    return (tx as any).artistPlanSubscription.create({
      data: {
        artistId: params.artistId,
        planSlug: plan.slug,
        status: 'active',
        paystackReference: params.reference,
        amount: plan.priceZAR,
        currency: params.currency,
        billingInterval: billingIntervalDbValue(plan.billingPeriod),
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
  });

  return { alreadyActive: false, subscription };
}
