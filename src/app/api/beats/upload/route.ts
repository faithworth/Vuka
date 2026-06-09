export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPresignedUploadUrl, getPublicUrl, r2Keys } from '@/lib/r2';
import { requireArtist } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { checkMonthlyUploadLimit } from '@/lib/plans';

// POST: create beat record + return presigned R2 upload URLs
// The client uploads files DIRECTLY to R2 using these URLs (PUT request)
// This bypasses Vercel's 4.5MB body limit entirely
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Plan upload limit check ──────────────────────────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const uploadsThisMonth = await prisma.beat.count({
      where: { artistId: user.artist.id, createdAt: { gte: monthStart } },
    });
    const limitCheck = checkMonthlyUploadLimit(
      (user.artist as any).planSlug,
      (user.artist as any).planExpiresAt,
      uploadsThisMonth,
    );
    if (!limitCheck.allowed) {
      return NextResponse.json({
        error: `You've reached your ${limitCheck.limit} upload${limitCheck.limit === 1 ? '' : 's'}/month limit on the Free plan. Upgrade to Pro for unlimited uploads.`,
        upgradeRequired: true,
      }, { status: 403 });
    }
    // ────────────────────────────────────────────────────────

    const body = await req.json();
    const { title, bpm, keySignature, genre, mood, tags, basicPrice, premiumPrice, exclPrice, hasWav, hasMp3, artworkType } = body;

    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    // Generate unique slug
    let slug = slugify(title);
    let suffix = 0;
    while (await prisma.beat.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(title)}-${suffix}`;
    }

    const beat = await prisma.beat.create({
      data: {
        artistId: user.artist.id,
        title,
        slug,
        bpm: parseInt(bpm) || 0,
        keySignature: keySignature || '',
        genre: genre || '',
        mood: mood || '',
        tags: tags || [],
        basicPrice: parseFloat(basicPrice) || 0,
        premiumPrice: parseFloat(premiumPrice) || 0,
        exclPrice: parseFloat(exclPrice) || 0,
        previewUrl: '',
        fullWavUrl: '',
        fullMp3Url: '',
        isActive: false,
      },
    });

    // Generate presigned PUT URLs — client uploads directly to R2
    // Content-type must match exactly what the client sends
    const uploadUrls: Record<string, string> = {};
    const publicUrls: Record<string, string> = {};

    const artworkKey = r2Keys.beatArtwork(beat.id);
    const artworkContentType = artworkType === 'image/png' ? 'image/png' : 'image/jpeg';
    uploadUrls.artwork = await getPresignedUploadUrl(artworkKey, artworkContentType);
    publicUrls.artworkUrl = getPublicUrl(artworkKey);

    const previewKey = r2Keys.beatPreview(beat.id);
    uploadUrls.preview = await getPresignedUploadUrl(previewKey, 'audio/mpeg');
    publicUrls.previewUrl = getPublicUrl(previewKey);

    if (hasWav) {
      const wavKey = r2Keys.beatFullWav(beat.id);
      uploadUrls.wav = await getPresignedUploadUrl(wavKey, 'audio/wav');
      publicUrls.fullWavUrl = getPublicUrl(wavKey);
    }
    if (hasMp3) {
      const mp3Key = r2Keys.beatFullMp3(beat.id);
      uploadUrls.mp3 = await getPresignedUploadUrl(mp3Key, 'audio/mpeg');
      publicUrls.fullMp3Url = getPublicUrl(mp3Key);
    }

    return NextResponse.json({ beat, uploadUrls, publicUrls });
  } catch (err: any) {
    console.error('[beats/upload] POST error:', err?.message || err);
    return NextResponse.json(
      { error: 'Upload setup failed — check R2 credentials and database connection', detail: err?.message },
      { status: 503 }
    );
  }
}

// PATCH: called after all direct-to-R2 uploads complete — activate the beat
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { beatId, artworkUrl, previewUrl, fullWavUrl, fullMp3Url } = await req.json();

    if (!beatId) return NextResponse.json({ error: 'beatId required' }, { status: 400 });

    const beat = await prisma.beat.findFirst({
      where: { id: beatId, artistId: user.artist.id },
    });
    if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });

    const updated = await prisma.beat.update({
      where: { id: beatId },
      data: {
        artworkUrl: artworkUrl || beat.artworkUrl,
        previewUrl: previewUrl || beat.previewUrl,
        fullWavUrl: fullWavUrl || beat.fullWavUrl,
        fullMp3Url: fullMp3Url || beat.fullMp3Url || previewUrl || beat.previewUrl,
        isActive: !!(previewUrl || beat.previewUrl),
      },
    });

    return NextResponse.json({ ok: true, beat: updated });
  } catch (err: any) {
    console.error('[beats/upload] PATCH error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to activate beat', detail: err?.message }, { status: 503 });
  }
}
