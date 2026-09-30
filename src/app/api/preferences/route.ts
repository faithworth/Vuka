import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { SUPPORTED_CURRENCIES } from '@/lib/fx';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ currency: 'ZAR', authenticated: false });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { currency: true } });
    return NextResponse.json({ currency: dbUser?.currency || 'ZAR', authenticated: true });
  } catch {
    return NextResponse.json({ currency: 'ZAR', authenticated: false });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const currency = String(body.currency || '').toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(currency as any)) {
      return NextResponse.json({ error: 'Unsupported currency' }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { currency } });
    if (user.artist) {
      await prisma.artist.update({ where: { id: user.artist.id }, data: { currency } });
    }
    return NextResponse.json({ currency });
  } catch {
    return NextResponse.json({ error: 'Could not save currency preference' }, { status: 503 });
  }
}