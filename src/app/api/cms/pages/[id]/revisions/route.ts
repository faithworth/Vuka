// GET/POST /api/cms/pages/[id]/revisions
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { canAccessCms, getRevisions, createRevision } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const revisions = await getRevisions(params.id);
    return NextResponse.json({ revisions });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { summary } = await req.json();
    const revision = await createRevision(params.id, user.id, summary ?? 'Manual snapshot');
    return NextResponse.json({ revision }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
