export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireArtist } from '@/lib/auth';
import { getPublicUrl, r2Keys } from '@/lib/r2';

async function loadOwnedBundle(id: string, artistId: string) {
  return prisma.beatBundle.findFirst({ where: { id, artistId } });
}

// GET /api/v2/beat-bundle/[id] — status poll
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bundle = await loadOwnedBundle(id, user.artist.id);
  if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ bundle });
}

// PATCH /api/v2/beat-bundle/[id]
// Body: {} — called once the client has finished PUTting the source WAV to
// the presigned URL from POST /api/v2/beat-bundle. Marks sourceWavUrl and
// attempts to kick off generation with the configured provider.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bundle = await loadOwnedBundle(id, user.artist.id);
  if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (bundle.status !== 'pending') {
    return NextResponse.json({ bundle }); // idempotent — already progressed
  }

  const sourceWavUrl = getPublicUrl(r2Keys.beatBundleSource(bundle.id));

  const provider = process.env.STEM_AI_PROVIDER || '';
  const apiKey = process.env.STEM_AI_API_KEY || '';

  if (!provider || !apiKey) {
    // Honest failure: no variation provider is wired up yet. The upload
    // itself succeeded (sourceWavUrl is saved) so nothing is lost — this
    // just can't auto-generate variations until a provider is configured.
    const updated = await prisma.beatBundle.update({
      where: { id: bundle.id },
      data: {
        sourceWavUrl,
        status: 'failed',
        errorMessage: 'No AI variation provider configured. Set STEM_AI_PROVIDER and STEM_AI_API_KEY to enable auto-generation.',
      },
    });
    return NextResponse.json({ bundle: updated });
  }

  // Real provider call would go here (Soundraw / Splitter.ai / etc), storing
  // providerJobId and moving status to 'processing'. A webhook or cron job
  // would then call POST /api/v2/beat-bundle/[id]/complete when done.
  // Left unimplemented until a provider + API contract is chosen.
  const updated = await prisma.beatBundle.update({
    where: { id: bundle.id },
    data: { sourceWavUrl, status: 'processing', provider },
  });
  return NextResponse.json({ bundle: updated });
}
