import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createInvoiceFromPurchase, generateTaxRecord, getArtistInvoices } from '@/lib/invoices';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  if (type === 'tax') {
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const artist = await prisma.artist.findUnique({ where: { userId: user.id } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    const record = await generateTaxRecord(artist.id, year);
    return NextResponse.json({ record });
  }

  const artist = await prisma.artist.findUnique({ where: { userId: user.id } });
  if (!artist) return NextResponse.json({ invoices: [] });

  const invoices = await getArtistInvoices(artist.id);
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { purchaseId } = await req.json();
  if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });

  const invoice = await createInvoiceFromPurchase(purchaseId);
  return NextResponse.json({ invoice }, { status: 201 });
}
