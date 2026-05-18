export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';

export async function GET(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = new URL(req.url).searchParams;
    const type = params.get('type'); // 'photo' | 'cover'
    const mimeType = params.get('mimeType') || 'image/jpeg';
    // Use the correct extension based on mime type
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
