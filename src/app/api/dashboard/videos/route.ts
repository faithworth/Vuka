// src/app/api/dashboard/videos/route.ts
// Handles Video and Sample CRUD for the artist dashboard.
// Request/response shapes match what src/app/dashboard/videos/page.tsx already sends.
//
// GET    → { items: [...] }            list all videos+samples, tagged with _type
// POST   → { item, uploadUrls, publicUrls }  create DB record + presigned R2 PUT URLs
// PATCH  → { ok }                      activate after upload, or edit metadata
// DELETE → { ok }                      delete (blocked if confirmed purchases exist)

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';
import { slugify } from '@/lib/utils';
import prisma from '@/lib/prisma';

// ── helpers ──────────────────────────────────────────────────

function extFor(mime: string): string {
  if (mime === 'video/mp4')                           return 'mp4';
  if (mime === 'video/quicktime')                     return 'mov';
  if (mime === 'image/png')                           return 'png';
  if (mime === 'image/webp')                          return 'webp';
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3')  return 'mp3';
  if (mime === 'application/zip')                     return 'zip';
  return mime.split('/')[1]?.split(';')[0] || 'bin';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 0;
  while (
    (await prisma.video.findUnique({ where: { slug } })) ||
    (await prisma.sample.findUnique({ where: { slug } }))
  ) {
    n++;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

// ── GET ──────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [videos, samples] = await Promise.all([
      prisma.video.findMany({
        where: { artistId: user.artist.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sample.findMany({
        where: { artistId: user.artist.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items = [
      ...videos.map(v  => ({ ...v,  _type: 'video'  as const })),
      ...samples.map(s => ({ ...s,  _type: 'sample' as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('[dashboard/videos] GET error:', err?.message);
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}

// ── POST ─────────────────────────────────────────────────────
// Creates the DB record (isActive=false) and returns presigned R2 PUT URLs.
// The browser uploads files directly to R2 — no file bytes touch this server.

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { type } = body;

    // ── video ────────────────────────────────────────────────
    if (type === 'video') {
      const { title, description, genre, price, tags, videoType, thumbType } = body;
      if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });
      if (!videoType)     return NextResponse.json({ error: 'videoType required' }, { status: 400 });

      const slug = await uniqueSlug(title);
      const ts   = Date.now();

      const video = await prisma.video.create({
        data: {
          artistId:     user.artist.id,
          title:        title.trim(),
          slug,
          description:  description || '',
          genre:        genre       || '',
          tags:         Array.isArray(tags) ? tags : [],
          price:        parseFloat(price)   || 0,
          videoUrl:     '',
          thumbnailUrl: '',
          isActive:     false,
        },
      });

      const videoKey = `videos/${user.artist.id}/${video.id}-${ts}.${extFor(videoType)}`;
      const thumbKey = `videos/thumbnails/${user.artist.id}/${video.id}-${ts}.${extFor(thumbType || 'image/jpeg')}`;

      const [videoUploadUrl, thumbUploadUrl] = await Promise.all([
        getPresignedUploadUrl(videoKey, videoType),
        getPresignedUploadUrl(thumbKey, thumbType || 'image/jpeg'),
      ]);

      return NextResponse.json({
        item: video,
        uploadUrls: { video: videoUploadUrl, thumbnail: thumbUploadUrl },
        publicUrls: {
          videoUrl:     getPublicUrl(videoKey),
          thumbnailUrl: getPublicUrl(thumbKey),
        },
      });
    }

    // ── sample ───────────────────────────────────────────────
    if (type === 'sample') {
      const { title, description, genre, price, bpm, keySignature, tags, fileType, artworkType, previewType } = body;
      if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });
      if (!fileType)      return NextResponse.json({ error: 'fileType required' }, { status: 400 });

      const slug = await uniqueSlug(title);
      const ts   = Date.now();

      const sample = await prisma.sample.create({
        data: {
          artistId:     user.artist.id,
          title:        title.trim(),
          slug,
          description:  description  || '',
          genre:        genre         || '',
          tags:         Array.isArray(tags) ? tags : [],
          price:        parseFloat(price)   || 0,
          bpm:          parseInt(bpm)        || 0,
          keySignature: keySignature || '',
          fileUrl:      '',
          artworkUrl:   '',
          previewUrl:   '',
          isActive:     false,
        },
      });

      const fileKey = `samples/${user.artist.id}/${sample.id}-${ts}.${extFor(fileType)}`;
      const artKey  = `samples/artwork/${user.artist.id}/${sample.id}-${ts}.${extFor(artworkType  || 'image/jpeg')}`;
      const prevKey = `samples/previews/${user.artist.id}/${sample.id}-${ts}.${extFor(previewType || 'audio/mpeg')}`;

      const [fileUploadUrl, artUploadUrl, prevUploadUrl] = await Promise.all([
        getPresignedUploadUrl(fileKey, fileType),
        getPresignedUploadUrl(artKey,  artworkType  || 'image/jpeg'),
        getPresignedUploadUrl(prevKey, previewType  || 'audio/mpeg'),
      ]);

      return NextResponse.json({
        item: sample,
        uploadUrls: { file: fileUploadUrl, artwork: artUploadUrl, preview: prevUploadUrl },
        publicUrls: {
          fileUrl:    getPublicUrl(fileKey),
          artworkUrl: getPublicUrl(artKey),
          previewUrl: getPublicUrl(prevKey),
        },
      });
    }

    return NextResponse.json({ error: 'type must be "video" or "sample"' }, { status: 400 });
  } catch (err: any) {
    console.error('[dashboard/videos] POST error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to create record' }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────
// Activation (after R2 upload) OR metadata edit.
// The page sends: { itemId, type, ...urlFields }  for activation
//                 { itemId, type, ...metaFields } for editing

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { itemId, type } = body;
    if (!itemId || !type) return NextResponse.json({ error: 'itemId and type required' }, { status: 400 });

    if (type === 'video') {
      const video = await prisma.video.findFirst({ where: { id: itemId, artistId: user.artist.id } });
      if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });

      const { videoUrl, thumbnailUrl, title, description, genre, price, tags, isActive } = body;

      // If URL fields are present → activation pass after upload
      const isActivation = videoUrl !== undefined || thumbnailUrl !== undefined;

      const data: any = {};
      if (isActivation) {
        data.videoUrl     = videoUrl     || video.videoUrl;
        data.thumbnailUrl = thumbnailUrl || video.thumbnailUrl;
        data.isActive     = !!(videoUrl  || video.videoUrl);
      } else {
        if (title       !== undefined) data.title       = title.trim();
        if (description !== undefined) data.description = description;
        if (genre       !== undefined) data.genre       = genre;
        if (price       !== undefined) data.price       = parseFloat(price) || 0;
        if (tags        !== undefined) data.tags        = Array.isArray(tags) ? tags : [];
        if (isActive    !== undefined) data.isActive    = isActive;
      }

      await prisma.video.update({ where: { id: itemId }, data });
      return NextResponse.json({ ok: true });
    }

    if (type === 'sample') {
      const sample = await prisma.sample.findFirst({ where: { id: itemId, artistId: user.artist.id } });
      if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 });

      const { fileUrl, artworkUrl, previewUrl, title, description, genre, price, bpm, keySignature, tags, isActive } = body;

      const isActivation = fileUrl !== undefined || artworkUrl !== undefined || previewUrl !== undefined;

      const data: any = {};
      if (isActivation) {
        data.fileUrl    = fileUrl    || sample.fileUrl;
        data.artworkUrl = artworkUrl || sample.artworkUrl;
        data.previewUrl = previewUrl || sample.previewUrl;
        data.isActive   = !!(fileUrl || sample.fileUrl);
      } else {
        if (title        !== undefined) data.title        = title.trim();
        if (description  !== undefined) data.description  = description;
        if (genre        !== undefined) data.genre        = genre;
        if (price        !== undefined) data.price        = parseFloat(price) || 0;
        if (bpm          !== undefined) data.bpm          = parseInt(bpm) || 0;
        if (keySignature !== undefined) data.keySignature = keySignature;
        if (tags         !== undefined) data.tags         = Array.isArray(tags) ? tags : [];
        if (isActive     !== undefined) data.isActive     = isActive;
      }

      await prisma.sample.update({ where: { id: itemId }, data });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'type must be "video" or "sample"' }, { status: 400 });
  } catch (err: any) {
    console.error('[dashboard/videos] PATCH error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────────
// ?itemId=&type=  — blocked if confirmed purchases exist

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');
    const type   = searchParams.get('type');
    if (!itemId || !type) return NextResponse.json({ error: 'itemId and type required' }, { status: 400 });

    if (type === 'video') {
      const video = await prisma.video.findFirst({
        where: { id: itemId, artistId: user.artist.id },
        include: { purchases: { where: { status: 'confirmed' } } },
      });
      if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      if (video.purchases.length > 0) {
        return NextResponse.json({
          error: `This video has ${video.purchases.length} confirmed sale(s). Hide it instead.`,
        }, { status: 409 });
      }
      await prisma.video.delete({ where: { id: itemId } });
      return NextResponse.json({ ok: true });
    }

    if (type === 'sample') {
      const sample = await prisma.sample.findFirst({
        where: { id: itemId, artistId: user.artist.id },
        include: { purchases: { where: { status: 'confirmed' } } },
      });
      if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
      if (sample.purchases.length > 0) {
        return NextResponse.json({
          error: `This sample pack has ${sample.purchases.length} confirmed sale(s). Hide it instead.`,
        }, { status: 409 });
      }
      await prisma.sample.delete({ where: { id: itemId } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'type must be "video" or "sample"' }, { status: 400 });
  } catch (err: any) {
    console.error('[dashboard/videos] DELETE error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
