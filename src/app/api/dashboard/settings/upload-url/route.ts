export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';

// ─── GET (legacy — profile photo/cover via query params) ──────
export async function GET(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = new URL(req.url).searchParams;
    const type = params.get('type') ?? 'photo'; // 'photo' | 'cover'
    const mimeType = params.get('mimeType') || 'image/jpeg';
    const imageExtensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = imageExtensions[mimeType];
    if ((type !== 'photo' && type !== 'cover') || !ext) {
      return NextResponse.json({ error: 'Unsupported profile image type.' }, { status: 400 });
    }
    const key = type === 'cover'
      ? `profiles/covers/${user.artist.id}.${ext}`
      : `profiles/photos/${user.artist.id}.${ext}`;

    const uploadUrl = await getPresignedUploadUrl(key, mimeType);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (err) {
    console.error('[settings/upload-url] GET error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

// ─── POST (all dashboard uploads: avatar, banner, artwork, audio) ─
// Body: { contentType: string, fileType: 'avatar' | 'banner' | 'artwork' | 'audio' }
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const contentType = typeof body?.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
    const fileType = typeof body?.fileType === 'string' ? body.fileType : '';
    if (!contentType || !fileType) {
      return NextResponse.json({ error: 'contentType and fileType required' }, { status: 400 });
    }

    // Never derive an object extension from an arbitrary client MIME subtype.
    // MIME values are declarations, not proof of file contents, but strict
    // per-category allowlists prevent obvious HTML/script/executable uploads.
    const allowedTypes: Record<string, Record<string, string>> = {
      avatar: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
      banner: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
      artwork: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
      eventCover: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
      exclusiveThumb: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
      audio: { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3' },
      exclusiveContent: {
        'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
        'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
        'video/mp4': 'mp4', 'video/quicktime': 'mov', 'application/pdf': 'pdf',
      },
    };
    const ext = allowedTypes[fileType]?.[contentType];
    if (!ext) {
      return NextResponse.json({ error: 'File type is not allowed for this upload category.' }, { status: 415 });
    }

    const artistId = user.artist.id;
    const ts = Date.now(); // timestamp prevents cache collisions on re-upload

    // Map the validated fileType → R2 key prefix
    let key: string;
    switch (fileType) {
      case 'avatar':
        key = `profiles/photos/${artistId}.${ext}`;
        break;
      case 'banner':
        key = `profiles/covers/${artistId}.${ext}`;
        break;
      case 'artwork':
        key = `artwork/releases/${artistId}-${ts}.${ext}`;
        break;
      case 'audio':
        key = `uploads/audio/${artistId}-${ts}.${ext}`;
        break;
      case 'eventCover':
        key = `events/covers/${artistId}-${ts}.${ext}`;
        break;
      case 'exclusiveContent':
        key = `exclusive/${artistId}-${ts}.${ext}`;
        break;
      case 'exclusiveThumb':
        key = `exclusive/thumbs/${artistId}-${ts}.${ext}`;
        break;
      default:
        return NextResponse.json({ error: `Unknown fileType: ${fileType}` }, { status: 400 });
    }

    const presignedUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl   = getPublicUrl(key);

    return NextResponse.json({ presignedUrl, publicUrl });
  } catch (err) {
    console.error('[settings/upload-url] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
