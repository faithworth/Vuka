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
    const type = params.get('type'); // 'photo' | 'cover'
    const mimeType = params.get('mimeType') || 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
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

    const { contentType, fileType } = await req.json();
    if (!contentType || !fileType) {
      return NextResponse.json({ error: 'contentType and fileType required' }, { status: 400 });
    }

    const artistId = user.artist.id;
    const ts = Date.now(); // timestamp prevents cache collisions on re-upload

    // Derive a safe file extension from the declared MIME type
    function extFor(mime: string): string {
      if (mime === 'image/png')  return 'png';
      if (mime === 'image/webp') return 'webp';
      if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav';
      if (mime === 'audio/flac') return 'flac';
      if (mime === 'audio/mpeg' || mime === 'audio/mp3')  return 'mp3';
      if (mime === 'image/jpeg') return 'jpg';
      // Fallback: grab the subtype
      return mime.split('/')[1]?.split(';')[0] || 'bin';
    }

    const ext = extFor(contentType);

    // Map fileType → R2 key prefix
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
