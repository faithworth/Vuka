import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});

export async function createCheckoutSession({
  itemName,
  amount,
  currency,
  metadata,
  artistStripeAccountId,
  successUrl,
  cancelUrl,
  customerEmail,
}: {
  itemName: string;
  amount: number; // in smallest currency unit (cents/pence/cents)
  currency: string;
  metadata: Record<string, string>;
  artistStripeAccountId?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}) {
  const platformFeePercent = parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT || "0");
  const applicationFeeAmount = Math.round(amount * (platformFeePercent / 100));

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: { name: itemName },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    payment_method_types: ["card"],
  };

  if (artistStripeAccountId && applicationFeeAmount >= 0) {
    sessionParams.payment_intent_data = {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: artistStripeAccountId },
    };
  }

  return stripe.checkout.sessions.create(sessionParams);
}

export async function createConnectAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
}

export async function createConnectAccount(email: string) {
  return stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
}
