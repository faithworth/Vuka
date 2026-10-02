export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPresignedUploadUrl, r2Keys } from '@/lib/r2';
import prisma from '@/lib/prisma';

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

    // Once a submission is pending or approved, its document reference is
    // immutable. This prevents accidental replacement of the evidence tied to
    // an in-flight or permanently retained approval.
    const existing = await prisma.verificationRequest.findUnique({
      where: { artistId: user.artist.id },
      select: { status: true },
    });
    if (existing?.status === 'pending' || existing?.status === 'approved') {
      return NextResponse.json(
        { error: existing.status === 'approved' ? 'Your verification is already approved' : 'Your verification is already under review' },
        { status: 409 },
      );
    }

    const { contentType, side = 'front' } = await req.json();
    if (side !== 'front' && side !== 'back') return NextResponse.json({ error: 'Invalid document side' }, { status: 400 });
    if (!contentType) return NextResponse.json({ error: 'contentType required' }, { status: 400 });

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!ALLOWED.includes(contentType)) {
      return NextResponse.json({ error: 'ID document must be a JPG, PNG, WebP, or PDF' }, { status: 400 });
    }

    const ext = contentType === 'application/pdf' ? 'pdf'
      : contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp'
      : 'jpg';

    const key = r2Keys.verificationDoc(user.artist.id, side, ext);
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return NextResponse.json({ uploadUrl, key });
  } catch (err) {
    console.error('[verification/upload-url] error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
