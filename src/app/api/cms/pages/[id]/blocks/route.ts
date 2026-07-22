// GET/POST/PUT /api/cms/pages/[id]/blocks
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms, defaultBlockContent, BlockType } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const blocks = await prisma.cmsBlock.findMany({ where: { pageId: params.id }, orderBy: { order: 'asc' } });
    return NextResponse.json({ blocks });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { type, label, insertAfter } = await req.json();
    const maxBlock = await prisma.cmsBlock.findFirst({ where: { pageId: params.id }, orderBy: { order: 'desc' }, select: { order: true } });
    let newOrder = (maxBlock?.order ?? -1) + 1;
    if (insertAfter) {
      const target = await prisma.cmsBlock.findUnique({ where: { id: insertAfter } });
      if (target) {
        newOrder = target.order + 1;
        await prisma.cmsBlock.updateMany({ where: { pageId: params.id, order: { gte: newOrder } }, data: { order: { increment: 1 } } });
      }
    }
    const block = await prisma.cmsBlock.create({
      data: {
        pageId: params.id, type, label: label?.trim() || type,
        content: defaultBlockContent(type as BlockType) as import('@prisma/client').Prisma.InputJsonValue,
        order: newOrder, isVisible: true,
      },
    });
    await prisma.cmsPage.update({ where: { id: params.id }, data: { updatedById: user.id } });
    return NextResponse.json({ block }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

// Reorder blocks — receives { order: [{id, order}] }
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { order: arr } = await req.json();
    if (!Array.isArray(arr)) return NextResponse.json({ error: 'order array required' }, { status: 400 });
    await Promise.all(arr.map((item: { id: string; order: number }) =>
      prisma.cmsBlock.update({ where: { id: item.id, pageId: params.id }, data: { order: item.order } })
    ));
    await prisma.cmsPage.update({ where: { id: params.id }, data: { updatedById: user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
