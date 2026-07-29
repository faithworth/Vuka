import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
  // FIX: newer @aws-sdk/client-s3 versions (3.729+) default to attaching a
  // flexible checksum (x-amz-checksum-crc32 trailer) on PutObject requests.
  // Cloudflare R2's S3-compatible API doesn't support this and rejects the
  // upload, which silently broke every server-side uploadBuffer() call
  // (license PDFs, receipts) while presigned-URL browser uploads kept
  // working fine (they never carry an SDK-injected checksum header).
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vuka-audio';

export const r2Keys = {
  beatArtwork: (id: string) => `artwork/beats/${id}.jpg`,
  beatPreview: (id: string) => `previews/beats/${id}.mp3`,
  beatFullWav: (id: string) => `private/beats/${id}.wav`,
  beatFullMp3: (id: string) => `private/beats/${id}.mp3`,
  releaseArtwork: (id: string) => `artwork/releases/${id}.jpg`,
  trackPreview: (id: string) => `previews/tracks/${id}.mp3`,
  trackFull: (id: string) => `private/tracks/${id}.mp3`,
  trackFullWav: (id: string) => `private/tracks/${id}.wav`,
  license: (id: string) => `licenses/${id}.pdf`,
  receipt: (id: string) => `receipts/${id}.pdf`,
};

export function getPublicUrl(key: string): string {
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';
  return `${base}/${key}`;
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(r2, command, { expiresIn: 3600 });
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, command, { expiresIn });
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}
