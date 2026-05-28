export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { createComment, getComments, deleteComment } from '@/lib/social';

// GET /api/social/comments?targetType=post&targetId=xxx&page=1
export async function GET(req: NextRequest) {
  try {
    const targetType = req.nextUrl.searchParams.get('targetType');
    const targetId = req.nextUrl.searchParams.get('targetId');
    if (!targetType || !targetId) {
      return NextResponse.json({ error: 'targetType and targetId required' }, { status: 400 });
    }

    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    const result = await getComments(targetType as 'post' | 'beat' | 'release', targetId, page, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Comments] GET error:', err);
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
  }
}

// POST /api/social/comments — create comment
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { body: text, targetType, targetId, postId, parentId } = body;

    if (!text || !targetType || !targetId) {
      return NextResponse.json({ error: 'body, targetType, and targetId required' }, { status: 400 });
    }

    const comment = await createComment(user.id, {
      body: text,
      postId:    targetType === 'post'    ? targetId : postId,
      beatId:    targetType === 'beat'    ? targetId : undefined,
      releaseId: targetType === 'release' ? targetId : undefined,
      parentId,
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create comment';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/social/comments?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Comment id required' }, { status: 400 });

    await deleteComment(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete comment';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
