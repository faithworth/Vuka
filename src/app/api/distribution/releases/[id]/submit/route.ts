// ============================================================
// PHASE 9 — src/app/api/distribution/releases/[id]/submit/route.ts
// Submit release for metadata review → delivery pipeline
// Now sends sendReleaseSubmitted email on success
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  validateReleaseMetadata,
  advanceReleaseStatus,
  initiateDeliveryPipeline,
  appendStatusHistory,
} from '@/lib/distribution';
import { sendReleaseSubmitted } from '@/lib/emails';

type Params = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const release = await prisma.distributionRelease.findFirst({
      where: { id: params.id, artistId: user.artist.id },
      include: { tracks: true },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    if (!['draft', 'failed'].includes(release.status)) {
      return NextResponse.json(
        { error: `Cannot submit a release with status "${release.status}"` },
        { status: 409 }
      );
    }

    const validation = validateReleaseMetadata({
      title: release.title,
      artistName: release.artistName,
      releaseType: release.releaseType,
      primaryGenre: release.primaryGenre,
      artworkUrl: release.artworkUrl,
      artworkStatus: release.artworkStatus,
      targetDSPs: release.targetDSPs,
      tracks: release.tracks.length > 0 ? release.tracks.map(t => ({
        title: t.title,
        trackNumber: t.trackNumber,
        masterFileUrl: t.masterFileUrl,
        masterFileStatus: t.masterFileStatus,
        isrc: t.isrc || undefined,
      })) : [{ title: 'placeholder', trackNumber: 1, masterFileUrl: '', masterFileStatus: 'pending' }],
      copyrightHolder: release.copyrightHolder,
      copyrightYear: release.copyrightYear || undefined,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Release has validation errors', errors: validation.errors, warnings: validation.warnings },
        { status: 422 }
      );
    }

    const history = appendStatusHistory(
      release.statusHistory as any[],
      'metadata_review',
      'Submitted for review by artist'
    );

    await prisma.distributionRelease.update({
      where: { id: params.id },
      data: { status: 'metadata_review', statusHistory: history },
    });

    // Phase 9: send submission email
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.co.za';
      await sendReleaseSubmitted({
        to: user.email,
        artistName: user.displayName || release.artistName,
        releaseTitle: release.title,
        releaseType: release.releaseType.toUpperCase(),
        trackCount: release.tracks.length,
        releaseUrl: `${appUrl}/dashboard/releases/${params.id}`,
      });
    } catch (emailErr) {
      console.error('[distribution/submit] Email send failed (non-fatal):', emailErr);
    }

    return NextResponse.json({
      ok: true,
      status: 'metadata_review',
      warnings: validation.warnings,
      message: 'Release submitted for review. Our team will review metadata and artwork within 24–48 hours.',
    });
  } catch (err: any) {
    console.error('[distribution/submit] POST error:', err?.message);
    return NextResponse.json({ error: 'Submission failed' }, { status: 503 });
  }
}
