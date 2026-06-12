// POST /api/cms/pages/[id]/revisions/[revId]  — restore revision
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms, createRevision } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string; revId: string } }) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const revision = await prisma.cmsRevision.findUnique({ where: { id: params.revId } });
    if (!revision || revision.pageId !== params.id) return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
    const snap = revision.blocks as unknown as Array<Record<string, unknown>>;
    // Save current state before overwriting
    await createRevision(params.id, user.id, 'Pre-restore snapshot');
    await prisma.cmsBlock.deleteMany({ where: { pageId: params.id } });
    if (snap.length > 0) {
      await prisma.cmsBlock.createMany({
        data: snap.map((b, i) => ({
          pageId: params.id, type: b.type as string, label: b.label as string,
          content: b.content as import('@prisma/client').Prisma.InputJsonValue,
          order: typeof b.order === 'number' ? b.order : i,
          isVisible: b.isVisible !== false,
        })),
      });
    }
    await prisma.cmsPage.update({ where: { id: params.id }, data: { updatedById: user.id } });
    return NextResponse.json({ ok: true, restored: snap.length });
  } catch (e) { console.error('[cms/restore]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
