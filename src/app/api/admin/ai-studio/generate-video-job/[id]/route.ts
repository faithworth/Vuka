export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/admin/ai-studio/generate-video-job/[id] — poll status/progress.
// This route does NOT advance the job — it's a cheap read for the client's
// poll loop. Advancing happens only via POST .../[id]/process.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const job = await prisma.aiJob.findUnique({ where: { id: params.id } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    return NextResponse.json({ job });
  } catch (err) {
    console.error('[generate-video-job/:id] GET error:', err);
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 });
  }
}
