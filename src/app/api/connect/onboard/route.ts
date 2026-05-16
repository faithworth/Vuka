export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { stripe, createConnectAccount, createConnectAccountLink } from '@/lib/stripe';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let accountId = user.artist.stripeAccountId;

  if (!accountId) {
    const account = await createConnectAccount(user.email);
    accountId = account.id;
    await prisma.artist.update({ where: { id: user.artist.id }, data: { stripeAccountId: accountId } });
  }

  const link = await createConnectAccountLink(
    accountId,
    `${appUrl}/checkout/connect-return`,
    `${appUrl}/api/connect/onboard`
  );

  return NextResponse.json({ url: link.url });
}
