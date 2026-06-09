// FIX: src/app/api/releases/upload/route.ts
// Added: auto-generate UPC on release creation and ISRC per track.
// ISRC format: ZA-ZAV-YY-NNNNN (South Africa / Vuka / year / designation)
// UPC: 12-digit with check digit
// These are stored in Release.upc and Track.isrc after the schema migration.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedUploadUrl, getPublicUrl, r2Keys } from '@/lib/r2';
import { requireArtist } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { generateISRC, generateUPC } from '@/lib/distribution';
import { getEffectivePlan, checkMonthlyUploadLimit } from '@/lib/plans';

// POST: create release + track records, return presigned R2 PUT URLs for direct browser upload
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Plan upload limit check ──────────────────────────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const uploadsThisMonth = await prisma.release.count({
      where: { artistId: user.artist.id, createdAt: { gte: monthStart } },
    });
    const limitCheck = checkMonthlyUploadLimit(
      (user.artist as any).planSlug,
      (user.artist as any).planExpiresAt,
      uploadsThisMonth,
    );
    if (!limitCheck.allowed) {
      return NextResponse.json({
        error: `You've reached your ${limitCheck.limit} release${limitCheck.limit === 1 ? '' : 's'}/month limit on the Free plan. Upgrade to Pro for unlimited releases.`,
        upgradeRequired: true,
      }, { status: 403 });
    }
    // ────────────────────────────────────────────────────────

    const body = await req.json();
    const { title, releaseType, price, minPrice, payWhatWant, description, credits, releaseDate, tracks, artworkType, trackAudioTypes } = body;

    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!tracks?.length) return NextResponse.json({ error: 'At least one track required' }, { status: 400 });

    // Generate unique slug
    let slug = slugify(title);
    let suffix = 0;
    while (await prisma.release.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(title)}-${suffix}`;
    }

    // Generate UPC for the release
    const upc = generateUPC();

    const release = await prisma.release.create({
      data: {
        artistId:   user.artist.id,
        title,
        slug,
        releaseType: releaseType || 'single',
        price:      parseFloat(price) || 0,
        minPrice:   parseFloat(minPrice) || 0,
        payWhatWant: !!payWhatWant,
        description: description || '',
        credits:     credits || '',
        releaseDate: releaseDate ? new Date(releaseDate) : undefined,
        upc,          // ← store UPC on the release
        isActive:    false,
      } as any, // 'as any' until prisma client is regenerated after migration
    });

    // Create track records with auto-generated ISRCs
    const trackRecords = await Promise.all(
      (tracks as { title: string; trackNumber: number }[]).map((t, i) =>
        prisma.track.create({
          data: {
            releaseId:   release.id,
            title:       t.title || `Track ${i + 1}`,
            trackNumber: t.trackNumber || i + 1,
            isrc:        generateISRC(), // ← generate ISRC per track
            previewUrl:  '',
            fullUrl:     '',
          } as any,
        })
      )
    );

    // Generate presigned PUT URLs — browser uploads directly to R2
    const uploadUrls: Record<string, string> = {};
    const publicUrls: Record<string, string> = {};

    const artworkKey = r2Keys.releaseArtwork(release.id);
    const artworkContentType = artworkType === 'image/png' ? 'image/png' : 'image/jpeg';
    uploadUrls.artwork = await getPresignedUploadUrl(artworkKey, artworkContentType);
    publicUrls.artworkUrl = getPublicUrl(artworkKey);

    for (const track of trackRecords) {
      const previewKey = r2Keys.trackPreview(track.id);
      const fullAudioType = (trackAudioTypes && trackAudioTypes[track.id]) === 'audio/wav' ? 'audio/wav' : 'audio/mpeg';
      const fullKey = fullAudioType === 'audio/wav' ? r2Keys.trackFullWav(track.id) : r2Keys.trackFull(track.id);
      uploadUrls[`preview_${track.id}`] = await getPresignedUploadUrl(previewKey, 'audio/mpeg');
      uploadUrls[`full_${track.id}`]    = await getPresignedUploadUrl(fullKey, fullAudioType);
      publicUrls[`previewUrl_${track.id}`] = getPublicUrl(previewKey);
      publicUrls[`fullUrl_${track.id}`]    = getPublicUrl(fullKey);
    }

    return NextResponse.json({ release, tracks: trackRecords, uploadUrls, publicUrls });
  } catch (err: any) {
    console.error('[releases/upload] POST error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 });
  }
}

// PATCH: activate release after files are uploaded to R2
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { releaseId, artworkUrl, trackUpdates } = body;

    if (!releaseId) return NextResponse.json({ error: 'releaseId required' }, { status: 400 });

    const release = await prisma.release.findFirst({
      where: { id: releaseId, artistId: user.artist.id },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    // Update each track's URLs
    if (trackUpdates && typeof trackUpdates === 'object') {
      await Promise.all(
        Object.entries(trackUpdates).map(([trackId, urls]: [string, any]) =>
          prisma.track.update({
            where: { id: trackId },
            data: {
              previewUrl: urls.previewUrl || '',
              fullUrl:    urls.fullUrl    || '',
            },
          }).catch(e => console.error(`Track update failed for ${trackId}:`, e))
        )
      );
    }

    // Activate release with artwork URL
    const updated = await prisma.release.update({
      where: { id: releaseId },
      data: {
        artworkUrl: artworkUrl || '',
        isActive:   true,
      },
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
    });

    return NextResponse.json({ release: updated });
  } catch (err: any) {
    console.error('[releases/upload] PATCH error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Activation failed' }, { status: 500 });
  }
}
