// src/app/api/industry/services/[id]/route.ts
// PATCH → update service
// DELETE → remove service

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Confirm ownership
    const existing = await prisma.industryService.findFirst({
      where: { id: params.id, industryUserId: iu.id },
    });
    if (!existing) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    const body = await req.json();
    const updated = await prisma.industryService.update({
      where: { id: params.id },
      data: {
        title: body.title?.trim() ?? existing.title,
        description: body.description?.trim() ?? existing.description,
        category: body.category ?? existing.category,
        priceZAR: body.priceZAR != null ? parseFloat(body.priceZAR) : existing.priceZAR,
        pricingModel: body.pricingModel ?? existing.pricingModel,
        deliveryDays: body.deliveryDays != null ? parseInt(body.deliveryDays) : existing.deliveryDays,
        isActive: body.isActive != null ? body.isActive : existing.isActive,
      },
    });

    return NextResponse.json({ service: updated });
  } catch (err) {
    console.error('[industry/services/[id] PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const existing = await prisma.industryService.findFirst({
      where: { id: params.id, industryUserId: iu.id },
    });
    if (!existing) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    // Delete inquiries first (FK constraint)
    await prisma.serviceInquiry.deleteMany({ where: { serviceId: params.id } });
    await prisma.industryService.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[industry/services/[id] DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
