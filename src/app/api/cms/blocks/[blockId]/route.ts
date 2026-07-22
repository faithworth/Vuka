// PATCH /DELETE /api/cms/blocks/[blockId]
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ blockId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { content, label, isVisible } = await req.json();
    const block = await prisma.cmsBlock.findUnique({ where: { id: params.blockId } });
    if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    const data: Record<string, unknown> = {};
    if (content   !== undefined) data.content   = content;
    if (label     !== undefined) data.label     = label.trim();
    if (isVisible !== undefined) data.isVisible = isVisible;
    const updated = await prisma.cmsBlock.update({ where: { id: params.blockId }, data });
    await prisma.cmsPage.update({ where: { id: block.pageId }, data: { updatedById: user.id } });
    return NextResponse.json({ block: updated });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ blockId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const block = await prisma.cmsBlock.findUnique({ where: { id: params.blockId } });
    if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    await prisma.cmsBlock.delete({ where: { id: params.blockId } });
    await prisma.cmsPage.update({ where: { id: block.pageId }, data: { updatedById: user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
