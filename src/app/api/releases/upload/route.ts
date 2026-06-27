// src/app/api/releases/upload/route.ts
// Artist release upload — operates on the Release/Track models (Vuka's
// direct-to-fan sales catalog). Vuka does NOT distribute to DSPs and does
// NOT issue ISRC/UPC codes — those calls were removed because the fields
// they wrote to don't exist on Release/Track and were causing every
// upload to fail with a Prisma validation error in production.
//
// Flow:
//   1. POST  — create the Release + Track rows, return presigned R2 PUT
//              URLs so the browser can upload artwork/audio directly.
//   2. PATCH — after the browser finishes uploading, save the public URLs
//              and activate the release (isActive: true).

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedUploadUrl, getPublicUrl, r2Keys } from '@/lib/r2';
import { requireArtist } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { getEffectivePlan, checkMonthlyUploadLimit } from '@/lib/plans';
import { sendReleaseLive } from '@/lib/emails';

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
    const {
      title, releaseType, price, minPrice, payWhatWant,
      description, credits, releaseDate, tracks,
      artworkType, trackAudioTypes,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!tracks?.length) return NextResponse.json({ error: 'At least one track required' }, { status: 400 });

    // Generate unique slug
    let slug = slugify(title);
    let suffix = 0;
    while (await prisma.release.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(title)}-${suffix}`;
    }

    const release = await prisma.release.create({
      data: {
        artistId:    user.artist.id,
        title:       title.trim(),
        slug,
        releaseType: (releaseType || 'single').toLowerCase(),
        price:       parseFloat(price) || 0,
        minPrice:    parseFloat(minPrice) || 0,
        payWhatWant: !!payWhatWant,
        description: description || '',
        credits:     credits || '',
        releaseDate: releaseDate ? new Date(releaseDate) : undefined,
        isActive:    false,
      },
    });

    // Create track records
    const trackRecords = await Promise.all(
      (tracks as { title: string; trackNumber: number }[]).map((t, i) =>
        prisma.track.create({
          data: {
            releaseId:   release.id,
            title:       t.title || `Track ${i + 1}`,
            trackNumber: t.trackNumber || i + 1,
            previewUrl:  '',
            fullUrl:     '',
          },
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
    const { releaseId, artworkUrl, trackUpdates, isActive } = body;

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

    const wasInactive = !release.isActive;
    const willActivate = isActive !== undefined ? !!isActive : undefined;

    // Activate release with artwork URL (only touches isActive when the caller
    // explicitly asked for it — lets this endpoint be reused for a plain
    // track-audio swap without accidentally changing publish state)
    const updated = await prisma.release.update({
      where: { id: releaseId },
      data: {
        ...(artworkUrl ? { artworkUrl } : {}),
        ...(willActivate !== undefined ? { isActive: willActivate } : {}),
      },
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
    });

    // First time going live — let the artist know. Vuka has no DSP delivery
    // pipeline, so this fires the moment the release actually goes live.
    if (wasInactive && willActivate) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.co.za';
        await sendReleaseLive({
          to: user.email,
          artistName: user.artist.name,
          releaseTitle: updated.title,
          shareUrl: `${appUrl}/releases/${updated.id}`,
          releaseUrl: `${appUrl}/dashboard/releases/${updated.id}`,
        });
      } catch (emailErr) {
        console.error('[releases/upload] PATCH live email failed (non-fatal):', emailErr);
      }
    }

    return NextResponse.json({ release: updated });
  } catch (err: any) {
    console.error('[releases/upload] PATCH error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Activation failed' }, { status: 500 });
  }
}
