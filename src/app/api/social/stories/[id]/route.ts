
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { markStoryViewed, deleteStory } from '@/lib/stories';

// POST /api/social/stories/[id] — mark viewed
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await markStoryViewed(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Story/id] POST error:', err);
    return NextResponse.json({ error: 'Failed to mark story viewed' }, { status: 500 });
  }
}

// DELETE /api/social/stories/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await deleteStory(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete story';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
