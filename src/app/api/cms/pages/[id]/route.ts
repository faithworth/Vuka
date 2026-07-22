// GET /PATCH /DELETE /api/cms/pages/[id]
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms, canDelete, canPublish, getCmsPage, createRevision } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const page = await getCmsPage(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ page });
  } catch (e) { console.error('[cms/pages/[id] GET]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    const { title, description, metaTitle, metaDesc, status, scheduledAt } = body;
    if (status === 'published' && !canPublish(user.role))
      return NextResponse.json({ error: 'You do not have permission to publish pages.' }, { status: 403 });
    const existing = await prisma.cmsPage.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const data: Record<string, unknown> = { updatedById: user.id };
    if (title       !== undefined) data.title       = title.trim();
    if (description !== undefined) data.description = description;
    if (metaTitle   !== undefined) data.metaTitle   = metaTitle;
    if (metaDesc    !== undefined) data.metaDesc    = metaDesc;
    if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (status      !== undefined) {
      data.status = status;
      if (status === 'published' && !existing.publishedAt) data.publishedAt = new Date();
    }
    const page = await prisma.cmsPage.update({ where: { id: params.id }, data });
    return NextResponse.json({ page });
  } catch (e) { console.error('[cms/pages/[id] PATCH]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canDelete(user.role)) return NextResponse.json({ error: 'Only owner/super_admin can delete pages.' }, { status: 403 });
    const page = await prisma.cmsPage.findUnique({ where: { id: params.id } });
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.isSystem) return NextResponse.json({ error: 'System pages cannot be deleted.' }, { status: 400 });
    await prisma.cmsPage.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { console.error('[cms/pages/[id] DELETE]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
