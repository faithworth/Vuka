// ============================================================
// PHASE 2 — src/app/api/invoices/route.ts
// Invoice management: list, generate PDF, download
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist, requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createInvoiceFromPurchase, generateTaxRecord, getPlatformCommissionReport } from '@/lib/invoices';

// GET — list invoices (artist sees their own; fan sees purchases they triggered)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view') || 'issued'; // issued | received | tax | commissions

    if (view === 'tax' && user.artist) {
      const taxYear = parseInt(searchParams.get('taxYear') || String(new Date().getFullYear()));
      const record = await generateTaxRecord(user.artist.id, taxYear);
      return NextResponse.json({ taxRecord: record });
    }

    if (view === 'commissions' && user.role && ['ADMIN','OWNER','SUPER_ADMIN'].includes(user.role)) {
      const period = searchParams.get('period') || undefined;
      const report = await getPlatformCommissionReport(period);
      return NextResponse.json({ commissions: report });
    }

    if (view === 'issued' && user.artist) {
      const invoices = await prisma.invoice.findMany({
        where: { artistId: user.artist.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return NextResponse.json({ invoices });
    }

    // Fan: invoices tied to their purchases
    const purchases = await prisma.purchase.findMany({
      where: { userId: user.id, status: 'confirmed' },
      select: { id: true },
    });
    const purchaseIds = purchases.map(p => p.id);
    const invoices = await prisma.invoice.findMany({
      where: { purchaseId: { in: purchaseIds } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ invoices });
  } catch (err) {
    console.error('[invoices] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — manually generate an invoice for a purchase (admin or artist)
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { purchaseId } = await req.json();
    if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });

    // Verify the purchase belongs to this artist's items
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { beat: true, release: true },
    });
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });

    const artistId = purchase.beat?.artistId || purchase.release?.artistId;
    if (artistId !== user.artist.id) {
      return NextResponse.json({ error: 'Purchase does not belong to your catalog' }, { status: 403 });
    }

    const invoice = await createInvoiceFromPurchase(purchaseId);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err: any) {
    console.error('[invoices] POST error:', err?.message);
    const code = err?.message?.includes('not confirmed') ? 409 : 503;
    return NextResponse.json({ error: err?.message || 'Invoice generation failed' }, { status: code });
  }
}
