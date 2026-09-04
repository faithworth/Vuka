export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPresignedUploadUrl, r2Keys } from '@/lib/r2';

// POST /api/dashboard/verification/upload-url
// Returns a presigned PUT URL for a PRIVATE key (private/verification/{artistId}.{ext}).
// Unlike every other upload in this app, this deliberately does NOT return a
// public URL — ID documents are never meant to be publicly readable. The
// returned `key` is what gets submitted to POST /api/moderation/verify as
// idDocumentUrl; viewing it later goes through the admin-only presigned
// GET /api/admin/verification/[requestId]/document route.
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { contentType } = await req.json();
    if (!contentType) return NextResponse.json({ error: 'contentType required' }, { status: 400 });

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!ALLOWED.includes(contentType)) {
      return NextResponse.json({ error: 'ID document must be a JPG, PNG, WebP, or PDF' }, { status: 400 });
    }

    const ext = contentType === 'application/pdf' ? 'pdf'
      : contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp'
      : 'jpg';

    const key = r2Keys.verificationDoc(user.artist.id, ext);
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return NextResponse.json({ uploadUrl, key });
  } catch (err) {
    console.error('[verification/upload-url] error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
