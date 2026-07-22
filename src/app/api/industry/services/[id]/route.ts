
// src/app/api/industry/services/[id]/route.ts
// PATCH → update service
// DELETE → remove service

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma, { queryRaw, executeRaw } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Confirm ownership
    const existing = await prisma.industryService.findFirst({
      where: { id, industryUserId: iu.id },
    });
    if (!existing) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    const body = await req.json();
    const now = new Date();

    await executeRaw(
      `UPDATE "IndustryService"
       SET title        = $1,
           description  = $2,
           category     = $3,
           "priceZAR"   = $4,
           "pricingModel" = $5,
           "deliveryDays" = $6,
           "isActive"   = $7,
           "updatedAt"  = $8
       WHERE id = $9`,
      body.title?.trim()       ?? existing.title,
      body.description?.trim() ?? existing.description,
      body.category            ?? existing.category,
      body.priceZAR != null ? parseFloat(body.priceZAR) : existing.priceZAR,
      body.pricingModel        ?? existing.pricingModel,
      body.deliveryDays != null ? parseInt(body.deliveryDays) : existing.deliveryDays,
      body.isActive != null ? body.isActive : existing.isActive,
      now,
      id,
    );

    const updated = await queryRaw(
      `SELECT * FROM "IndustryService" WHERE id = $1`,
      id,
    ).then(rows => rows[0]);

    return NextResponse.json({ service: updated });
  } catch (err) {
    console.error('[industry/services/[id] PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const existing = await prisma.industryService.findFirst({
      where: { id, industryUserId: iu.id },
    });
    if (!existing) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    // Delete inquiries first (FK constraint)
    await prisma.serviceInquiry.deleteMany({ where: { serviceId: id } });
    await prisma.industryService.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[industry/services/[id] DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
