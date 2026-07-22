// GET/POST /api/cms/pages/[id]/collaborate
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms, CMS_ADMIN_ROLES } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const [collaborators, comments] = await Promise.all([
      prisma.cmsCollaboration.findMany({
        where: { pageId: params.id },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { addedAt: 'asc' },
      }),
      prisma.cmsComment.findMany({ where: { pageId: params.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    return NextResponse.json({ collaborators, comments });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();

    if (body.type === 'collaborator') {
      if (!CMS_ADMIN_ROLES.includes(user.role))
        return NextResponse.json({ error: 'Only admins can manage collaborators.' }, { status: 403 });
      const target = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const collab = await prisma.cmsCollaboration.upsert({
        where: { pageId_userId: { pageId: params.id, userId: body.userId } },
        create: { pageId: params.id, userId: body.userId, canEdit: body.canEdit ?? true, canPublish: body.canPublish ?? false, addedById: user.id },
        update: { canEdit: body.canEdit ?? true, canPublish: body.canPublish ?? false },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });
      return NextResponse.json({ collaborator: collab }, { status: 201 });
    }

    if (body.type === 'remove_collaborator') {
      if (!CMS_ADMIN_ROLES.includes(user.role))
        return NextResponse.json({ error: 'Only admins can remove collaborators.' }, { status: 403 });
      await prisma.cmsCollaboration.delete({ where: { pageId_userId: { pageId: params.id, userId: body.userId } } });
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'comment') {
      if (!body.body?.trim()) return NextResponse.json({ error: 'Comment body required' }, { status: 400 });
      const comment = await prisma.cmsComment.create({ data: { pageId: params.id, body: body.body.trim(), createdById: user.id } });
      return NextResponse.json({ comment }, { status: 201 });
    }

    if (body.type === 'resolve_comment') {
      const comment = await prisma.cmsComment.update({ where: { id: body.commentId }, data: { resolved: true } });
      return NextResponse.json({ comment });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) { console.error('[cms/collaborate]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
