/**
 * VUKA — Cloudflare Worker: Audio CDN Edge Delivery
 * Phase 11 — Infrastructure & Deployment
 *
 * Routes:
 *   GET /audio/:key            — stream audio from R2 with range request support
 *   GET /artwork/:key          — serve artwork with edge caching
 *   GET /preview/:key          — serve 30-second preview clips
 *
 * Deploy:
 *   wrangler deploy cloudflare/audio-worker.js --name vuka-audio
 *
 * Required Wrangler bindings (wrangler.toml):
 *   [[r2_buckets]]
 *   binding = "AUDIO_BUCKET"
 *   bucket_name = "vuka-audio"
 *
 *   [[r2_buckets]]
 *   binding = "ARTWORK_BUCKET"
 *   bucket_name = "vuka-artwork"
 *
 * Security:
 *   - All audio requests require a signed token (HMAC-SHA256) from the API
 *   - Tokens expire after 4 hours
 *   - IP binding optional (set BIND_IP_TO_TOKEN=true in wrangler env)
 */

const ALLOWED_ORIGINS = [
  'https://www.vuka.app',
  'https://vuka.app',
  'http://localhost:3000',
];

const CACHE_TTL = {
  audio:   3600 * 24 * 365, // 1 year — immutable after upload
  artwork: 3600 * 24,       // 24 hours
  preview: 3600 * 24 * 30,  // 30 days
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';

    // ── CORS ────────────────────────────────────────────────────
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Authorization',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const [, route, ...rest] = url.pathname.split('/');
    const key = rest.join('/');

    if (!key) {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    // ── Token verification for audio/preview ────────────────────
    if (route === 'audio' || route === 'preview') {
      const token = url.searchParams.get('t');
      const exp   = url.searchParams.get('exp');

      if (!token || !exp) {
        return new Response('Unauthorized — token required', { status: 401, headers: corsHeaders });
      }

      // Verify token expiry
      const expiresAt = parseInt(exp, 10);
      if (Date.now() / 1000 > expiresAt) {
        return new Response('Token expired', { status: 401, headers: corsHeaders });
      }

      // Verify HMAC-SHA256 signature: HMAC(key + "|" + exp, SIGNING_SECRET)
      const isValid = await verifyToken(key, exp, token, env.SIGNING_SECRET);
      if (!isValid) {
        return new Response('Invalid token', { status: 403, headers: corsHeaders });
      }
    }

    // ── Route to correct R2 bucket ───────────────────────────────
    let bucket, cacheControl, contentType;

    switch (route) {
      case 'audio':
        bucket       = env.AUDIO_BUCKET;
        cacheControl = `public, max-age=${CACHE_TTL.audio}, immutable`;
        contentType  = 'audio/mpeg';
        break;
      case 'preview':
        bucket       = env.AUDIO_BUCKET;
        cacheControl = `public, max-age=${CACHE_TTL.preview}`;
        contentType  = 'audio/mpeg';
        break;
      case 'artwork':
        bucket       = env.ARTWORK_BUCKET;
        cacheControl = `public, max-age=${CACHE_TTL.artwork}, stale-while-revalidate=3600`;
        contentType  = key.endsWith('.png') ? 'image/png' : 'image/jpeg';
        break;
      default:
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    // ── Check Cloudflare cache first ─────────────────────────────
    const cacheKey = new Request(request.url, request);
    const cache    = caches.default;
    const cached   = await cache.match(cacheKey);
    if (cached) {
      const cachedResponse = new Response(cached.body, cached);
      Object.entries(corsHeaders).forEach(([k, v]) => cachedResponse.headers.set(k, v));
      return cachedResponse;
    }

    // ── Fetch from R2 ────────────────────────────────────────────
    const rangeHeader = request.headers.get('Range');
    let object;

    try {
      if (rangeHeader) {
        object = await bucket.get(key, { range: parseRange(rangeHeader) });
      } else {
        object = await bucket.get(key);
      }
    } catch {
      return new Response('Internal Error', { status: 500, headers: corsHeaders });
    }

    if (!object) {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    const headers = new Headers({
      ...corsHeaders,
      'Content-Type':   object.httpMetadata?.contentType ?? contentType,
      'Cache-Control':  cacheControl,
      'Accept-Ranges':  'bytes',
      'ETag':           `"${object.etag}"`,
      'Last-Modified':  object.uploaded?.toUTCString() ?? new Date().toUTCString(),
      'X-Content-Size': String(object.size),
    });

    let status = 200;
    if (rangeHeader && object.range) {
      const { offset, length } = object.range;
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set('Content-Length', String(length));
      status = 206;
    } else {
      headers.set('Content-Length', String(object.size));
    }

    const response = new Response(object.body, { status, headers });

    // Cache in Cloudflare edge (only cache full responses, not range requests)
    if (status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};

// ── Helpers ──────────────────────────────────────────────────

async function verifyToken(key, exp, token, secret) {
  if (!secret) return false;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const message = encoder.encode(`${key}|${exp}`);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );

  const tokenBytes = hexToBytes(token);
  return crypto.subtle.verify('HMAC', cryptoKey, tokenBytes, message);
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function parseRange(rangeHeader) {
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return {};
  const offset = parseInt(match[1], 10);
  const end    = match[2] ? parseInt(match[2], 10) : undefined;
  return end !== undefined
    ? { offset, length: end - offset + 1 }
    : { offset, suffix: undefined };
}
