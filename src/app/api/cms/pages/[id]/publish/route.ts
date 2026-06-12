// POST /api/cms/pages/[id]/publish
// action: publish | unpublish | archive | review | approve | draft
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms, canPublish, createRevision } from '@/lib/cms';

export const dynamic = 'force-dynamic';

const STATUS_MAP: Record<string, string> = {
  publish: 'published', unpublish: 'draft', archive: 'archived',
  review: 'review', approve: 'approved', draft: 'draft',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { action, summary } = await req.json();
    const newStatus = STATUS_MAP[action];
    if (!newStatus) return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    if (['publish', 'approve', 'archive'].includes(action) && !canPublish(user.role))
      return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 });
    const page = await prisma.cmsPage.findUnique({ where: { id: params.id } });
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (['publish', 'approve'].includes(action)) {
      await createRevision(params.id, user.id, summary ?? `${action} by ${user.name}`);
    }
    const data: Record<string, unknown> = { status: newStatus, updatedById: user.id };
    if (action === 'publish' && !page.publishedAt) data.publishedAt = new Date();
    const updated = await prisma.cmsPage.update({ where: { id: params.id }, data });
    return NextResponse.json({ page: updated });
  } catch (e) { console.error('[cms/publish]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
