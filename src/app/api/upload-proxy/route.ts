export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// Increase body size limit for audio files
export const config = { api: { bodyParser: false } };

import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { r2, r2Keys, getPublicUrl } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vuka-audio';

// Maps file role to R2 key generator
function getKey(role: string, id: string): string | null {
  switch (role) {
    case 'beat-artwork': return r2Keys.beatArtwork(id);
    case 'beat-preview': return r2Keys.beatPreview(id);
    case 'beat-wav': return r2Keys.beatFullWav(id);
    case 'beat-mp3': return r2Keys.beatFullMp3(id);
    case 'release-artwork': return r2Keys.releaseArtwork(id);
    case 'track-preview': return r2Keys.trackPreview(id);
    case 'track-full': return r2Keys.trackFull(id);
    default: return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const role = formData.get('role') as string | null;
    const id = formData.get('id') as string | null;

    if (!file || !role || !id) {
      return NextResponse.json({ error: 'Missing file, role, or id' }, { status: 400 });
    }

    const key = getKey(role, id);
    if (!key) return NextResponse.json({ error: `Unknown role: ${role}` }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'application/octet-stream',
    }));

    const publicUrl = getPublicUrl(key);
    return NextResponse.json({ ok: true, publicUrl });
  } catch (err: any) {
    console.error('[upload-proxy] error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
