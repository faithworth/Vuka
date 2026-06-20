// GET  /api/dashboard/splits — list artist's split sheets
// POST /api/dashboard/splits — create a split sheet

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sheets = await prisma.splitSheet.findMany({
      where:   { artistId: user.artist.id },
      include: { splits: { orderBy: { percentage: 'desc' } }, _count: { select: { disbursements: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ sheets });
  } catch (err) {
    console.error('[splits/GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { title, itemType, itemId, splits } = body;

    if (!title?.trim())  return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!itemType)       return NextResponse.json({ error: 'itemType required (beat|release|track)' }, { status: 400 });
    if (!itemId)         return NextResponse.json({ error: 'itemId required' }, { status: 400 });
    if (!splits?.length) return NextResponse.json({ error: 'At least one recipient required' }, { status: 400 });

    // Validate percentages sum to 100
    const total = splits.reduce((s: number, r: any) => s + (parseFloat(r.percentage) || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      return NextResponse.json({ error: `Percentages must sum to 100 (currently ${total.toFixed(2)}%)` }, { status: 400 });
    }

    // Validate each recipient
    for (const r of splits) {
      if (!r.name?.trim())  return NextResponse.json({ error: 'Each recipient needs a name' }, { status: 400 });
      if (!r.email?.trim()) return NextResponse.json({ error: 'Each recipient needs an email' }, { status: 400 });
      if (!r.percentage || r.percentage <= 0) {
        return NextResponse.json({ error: 'Each recipient needs a positive percentage' }, { status: 400 });
      }
    }

    // Check for duplicate item sheet
    const existing = await prisma.splitSheet.findUnique({ where: { itemType_itemId: { itemType, itemId } } });
    if (existing) {
      return NextResponse.json({ error: 'A split sheet already exists for this item. Edit the existing one.' }, { status: 409 });
    }

    const sheet = await prisma.splitSheet.create({
      data: {
        id:       `ss_${Date.now()}`,
        artistId: user.artist.id,
        itemType,
        itemId,
        title:    title.trim(),
        splits: {
          create: splits.map((r: any) => ({
            id:         `sr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            name:       r.name.trim(),
            email:      r.email.trim().toLowerCase(),
            artistId:   r.artistId ?? null,
            role:       r.role ?? '',
            percentage: parseFloat(r.percentage),
          })),
        },
      },
      include: { splits: true },
    });

    return NextResponse.json({ ok: true, sheet });
  } catch (err) {
    console.error('[splits/POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
