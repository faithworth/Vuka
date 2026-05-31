export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

// PATCH /api/social/posts/[id] — edit or pin/unpin a post
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const post = await prisma.artistPost.findUnique({
      where: { id: params.id },
      include: { artist: { select: { userId: true } } },
    });
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (post.artist.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const updated = await prisma.artistPost.update({
      where: { id: params.id },
      data: {
        ...(body.body !== undefined ? { body: body.body.slice(0, 2000) } : {}),
        ...(body.isPinned !== undefined ? { isPinned: body.isPinned } : {}),
        ...(body.isPublished !== undefined ? { isPublished: body.isPublished } : {}),
      },
    });

    return NextResponse.json({ post: updated });
  } catch (err) {
    console.error('[Posts/id] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

// DELETE /api/social/posts/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const post = await prisma.artistPost.findUnique({
      where: { id: params.id },
      include: { artist: { select: { userId: true } } },
    });
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isAdmin = ['owner', 'super_admin', 'admin', 'moderator'].includes(user.role);
    if (post.artist.userId !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.artistPost.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Posts/id] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
