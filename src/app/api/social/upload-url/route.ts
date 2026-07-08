export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const VALID_CONTEXTS = ['post', 'message', 'story', 'reel'] as const;
type UploadContext = typeof VALID_CONTEXTS[number];

const MAX_FILES_PER_POST = 4;

// POST /api/social/upload-url — presigned upload for feed post media,
// message attachments, stories, and reels. Open to any authenticated user
// (fans can attach images to messages; artists attach media to
// posts/stories/reels) — unlike the dashboard upload endpoint, which is
// artist-only.
// Body: { contentType: string, context: 'post' | 'message' | 'story' | 'reel' }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.social_upload, ip);
    if (limited) return NextResponse.json({ error: 'Too many uploads — please slow down' }, { status: 429 });

    const { contentType, context } = await req.json();
    if (!contentType || !ALLOWED[contentType]) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }
    if (!VALID_CONTEXTS.includes(context)) {
      return NextResponse.json({ error: `context must be one of: ${VALID_CONTEXTS.join(', ')}` }, { status: 400 });
    }
    const isVideo = contentType.startsWith('video/');
    if (isVideo && context !== 'story' && context !== 'reel') {
      return NextResponse.json({ error: 'Video uploads are only supported for stories and reels' }, { status: 400 });
    }

    const ext = ALLOWED[contentType];
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const folder: Record<UploadContext, string> = {
      post: 'social/posts', message: 'social/messages', story: 'social/stories', reel: 'social/reels',
    };
    const key = `${folder[context as UploadContext]}/${user.id}-${ts}-${rand}.${ext}`;

    const presignedUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ presignedUrl, publicUrl, maxFiles: MAX_FILES_PER_POST });
  } catch (err) {
    console.error('[social/upload-url] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
