export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { slugify } from '@/lib/utils';

// POST /api/v2/beat-bundle/[id]/complete
// Body: { variantUrls: string[] }
// Auth: admin session, OR header x-stem-ai-secret matching STEM_AI_WEBHOOK_SECRET
// (for a future provider webhook to call this directly, same pattern as the
// x-cron-secret check in /api/workers/cron).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sharedSecret = process.env.STEM_AI_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-stem-ai-secret');
  const isProviderCall = !!sharedSecret && providedSecret === sharedSecret;

  if (!isProviderCall) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bundle = await prisma.beatBundle.findUnique({ where: { id }, include: { artist: true } });
  if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const variantUrls: string[] = Array.isArray(body.variantUrls) ? body.variantUrls : [];
  if (variantUrls.length === 0) {
    return NextResponse.json({ error: 'variantUrls required' }, { status: 400 });
  }

  const createdBeatIds: string[] = [];

  for (let i = 0; i < variantUrls.length; i++) {
    const variantTitle = `${bundle.title} — Variation ${i + 1}`;
    let slug = slugify(variantTitle);
    let suffix = 0;
    while (await prisma.beat.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(variantTitle)}-${suffix}`;
    }

    const beat = await prisma.beat.create({
      data: {
        artistId: bundle.artistId,
        title: variantTitle,
        slug,
        previewUrl: variantUrls[i],
        fullMp3Url: variantUrls[i],
        isActive: false, // draft — artist reviews, prices, and activates manually
      },
    });
    createdBeatIds.push(beat.id);
  }

  const updated = await prisma.beatBundle.update({
    where: { id: bundle.id },
    data: {
      status: 'ready',
      generatedBeatIds: { push: createdBeatIds },
    },
  });

  return NextResponse.json({ bundle: updated, createdBeatIds });
}
