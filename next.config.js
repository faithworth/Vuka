/** @type {import('next').NextConfig} */

// ── Content Security Policy ─────────────────────────────────────────────────
// Phase 11: adds Flutterwave, PayPal, PostHog, Sentry connect-src targets.
// Audio/image served from Cloudflare CDN (R2 + Workers) edge layer.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Next.js requires unsafe-inline for inline style tags; unsafe-eval needed
  // for turbopack / dynamic chunk loading in dev only.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.payfast.co.za https://sandbox.payfast.co.za https://app.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // R2 public CDN + Supabase storage for images/artwork
  "img-src 'self' data: blob: https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.supabase.co https://*.cloudflare.com https://app.posthog.com",
  // Audio served from R2/Cloudflare CDN edge
  "media-src 'self' blob: https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.cloudflare.com",
  // PayFast redirect — no iframes used
  "frame-src https://www.payfast.co.za https://sandbox.payfast.co.za",
  "frame-ancestors 'none'",
  [
    "connect-src",
    "'self'",
    // Supabase Auth + Realtime WebSocket
    "https://*.supabase.co",
    "wss://*.supabase.co",
    // Cloudflare R2 uploads
    "https://*.r2.cloudflarestorage.com",
    "https://*.r2.dev",
    // Resend email
    "https://api.resend.com",
    // PayFast (ZA payments)
    "https://www.payfast.co.za",
    "https://sandbox.payfast.co.za",
    "https://api.payfast.co.za",
    // Flutterwave (Pan-Africa payments)
    "https://api.flutterwave.com",
    "https://checkout.flutterwave.com",
    // PayPal (international)
    "https://api-m.paypal.com",
    "https://api.paypal.com",
    // Upstash Redis (rate limiting)
    "https://*.upstash.io",
    // PostHog analytics
    "https://app.posthog.com",
    "https://eu.i.posthog.com",
    // Sentry error tracking
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
  ].join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      // Cloudflare CDN edge (audio artwork served via Workers)
      { protocol: 'https', hostname: '**.cloudflare.com' },
      { protocol: 'https', hostname: '**.cloudflareimages.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Phase 11: limit image sizes for optimisation (matches 8px grid breakpoints)
    deviceSizes: [375, 640, 768, 1024, 1280, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        // ── Security headers — every route ──────────────────────────────
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), magnetometer=()',
          },
          { key: 'X-DNS-Prefetch-Control',    value: 'on' },
          { key: 'Content-Security-Policy',   value: CSP_DIRECTIVES },
          { key: 'X-Robots-Tag',              value: 'index, follow' },
        ],
      },
      {
        // ── Immutable cache for static assets (Cloudflare passes these through) ──
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // ── Artwork/images: cache 24h at Cloudflare edge ───────────────
        source: '/images/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=3600' },
        ],
      },
      {
        // ── No-cache on all API routes — Cloudflare page rule bypasses these ──
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma',        value: 'no-cache' },
          { key: 'Expires',       value: '0' },
        ],
      },
      {
        // ── Admin routes: no-index + no-cache ─────────────────────────
        source: '/admin(.*)',
        headers: [
          { key: 'X-Robots-Tag',  value: 'noindex, nofollow, nosnippet' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
      {
        // ── Webhook routes: no-cache, no log ──────────────────────────
        source: '/api/webhooks/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag',  value: 'noindex, nofollow' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // Canonical redirect: non-www → www (handled by Cloudflare in prod,
      // but keep here as fallback)
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'vuka.app' }],
        destination: 'https://www.vuka.app/:path*',
        permanent: true,
      },
    ];
  },

  // Prevent accidental exposure of server-only modules in client bundle
  serverExternalPackages: ['@prisma/client', 'prisma'],

  // TypeScript / ESLint: surface errors in CI
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Phase 11: bundle analyser support — set ANALYZE=true locally
  ...(process.env.ANALYZE === 'true' ? {
    // @next/bundle-analyzer wraps this config when installed
  } : {}),
};

module.exports = nextConfig;
