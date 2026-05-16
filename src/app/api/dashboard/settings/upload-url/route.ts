export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';

export async function GET(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const type = new URL(req.url).searchParams.get('type'); // 'photo' | 'cover'
    const key = type === 'cover'
      ? `profiles/covers/${user.artist.id}.jpg`
      : `profiles/photos/${user.artist.id}.jpg`;

    const uploadUrl = await getPresignedUploadUrl(key, 'image/jpeg');
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (err) {
    console.error('[settings/upload-url] GET error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
