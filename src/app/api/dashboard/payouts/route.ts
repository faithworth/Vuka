export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { stripe } from '@/lib/stripe';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!user.artist.stripeAccountId) {
    return NextResponse.json({ payouts: [], balance: null, connected: false });
  }

  try {
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve({ stripeAccount: user.artist.stripeAccountId }),
      stripe.payouts.list({ limit: 20 }, { stripeAccount: user.artist.stripeAccountId }),
    ]);
    return NextResponse.json({ 
      payouts: payouts.data, 
      balance,
      connected: true 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
