/**
 * VUKA — CDN & Signed URL Utilities
 * Phase 11 — Infrastructure & Deployment
 *
 * Generates signed, expiring URLs for audio and artwork delivery
 * through the Cloudflare CDN / R2 layer.
 *
 * Audio tokens are verified by the Cloudflare Worker (cloudflare/audio-worker.js).
 */

import { createHmac } from 'crypto';

const R2_PUBLIC_URL  = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '';
const CF_CDN_URL     = process.env.NEXT_PUBLIC_CF_CDN_URL ?? R2_PUBLIC_URL;
const SIGNING_SECRET = process.env.ENCRYPTION_KEY ?? ''; // reuse AES key as HMAC base

const AUDIO_TOKEN_TTL_SECONDS  = 4 * 60 * 60;  // 4 hours
const PREVIEW_TOKEN_TTL_SECONDS = 30 * 60;      // 30 minutes

/**
 * Generate a signed audio streaming URL.
 * The Cloudflare Worker validates the HMAC token before serving the file.
 *
 * @param storageKey  R2 object key (e.g. "audio/artist123/track456.mp3")
 * @param type        'audio' (full) | 'preview' (30s clip)
 */
export function signedAudioUrl(
  storageKey: string,
  type: 'audio' | 'preview' = 'audio',
): string {
  const exp = Math.floor(Date.now() / 1000) + (
    type === 'preview' ? PREVIEW_TOKEN_TTL_SECONDS : AUDIO_TOKEN_TTL_SECONDS
  );

  const token = createHmac('sha256', SIGNING_SECRET)
    .update(`${storageKey}|${exp}`)
    .digest('hex');

  const base = CF_CDN_URL.replace(/\/$/, '');
  return `${base}/${type}/${storageKey}?t=${token}&exp=${exp}`;
}

/**
 * Artwork URL — public, no token required.
 * Cache headers set by Cloudflare Worker / R2 (24h).
 */
export function artworkUrl(storageKey: string): string {
  if (!storageKey) return '';
  const base = CF_CDN_URL.replace(/\/$/, '');
  return `${base}/artwork/${storageKey}`;
}

/**
 * R2 storage key from a raw public URL (reverse lookup).
 * Used when we have a stored URL and need the key for operations.
 */
export function storageKeyFromUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // Remove leading slash from pathname
    return parsed.pathname.replace(/^\//, '');
  } catch {
    return url;
  }
}

/**
 * Generate a Supabase-style storage path for audio files.
 * Convention: audio/<userId>/<releaseId>/<trackId>.<ext>
 */
export function buildAudioStoragePath(params: {
  userId: string;
  releaseId: string;
  trackId: string;
  extension: string;
}): string {
  return `audio/${params.userId}/${params.releaseId}/${params.trackId}.${params.extension}`;
}

/**
 * Generate a storage path for artwork.
 * Convention: artwork/<userId>/<releaseId>.<ext>
 */
export function buildArtworkStoragePath(params: {
  userId: string;
  releaseId: string;
  extension: string;
}): string {
  return `artwork/${params.userId}/${params.releaseId}.${params.extension}`;
}
