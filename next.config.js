/** @type {import('next').NextConfig} */

// ── Content Security Policy ─────────────────────────────────────────────────
// Paystack replaces PayFast. paystack.co removed; paystack.com added.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co https://app.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.supabase.co https://*.cloudflare.com https://app.posthog.com",
  "media-src 'self' blob: https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.cloudflare.com",
  // Paystack uses iframes for their hosted checkout on some flows
  "frame-src https://checkout.paystack.com",
  "frame-ancestors 'none'",
  [
    "connect-src",
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://*.r2.cloudflarestorage.com",
    "https://*.r2.dev",
    "https://api.resend.com",
    // Paystack
    "https://api.paystack.co",
    "https://checkout.paystack.com",
    // Flutterwave (Pan-Africa)
    "https://api.flutterwave.com",
    "https://checkout.flutterwave.com",
    // PayPal (international)
    "https://api-m.paypal.com",
    "https://api.paypal.com",
    // Upstash Redis
    "https://*.upstash.io",
    // PostHog
    "https://app.posthog.com",
    "https://eu.i.posthog.com",
    // Sentry
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
  ].join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  // No form-action needed — Paystack uses redirect, not form POST
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.cloudflare.com' },
      { protocol: 'https', hostname: '**.cloudflareimages.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [375, 640, 768, 1024, 1280, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), magnetometer=()' },
          { key: 'X-DNS-Prefetch-Control',    value: 'on' },
          { key: 'Content-Security-Policy',   value: CSP_DIRECTIVES },
          { key: 'X-Robots-Tag',              value: 'index, follow' },
        ],
      },
      { source: '/_next/static/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/images/(.*)',        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=3600' }] },
      { source: '/api/(.*)',           headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' }, { key: 'Pragma', value: 'no-cache' }, { key: 'Expires', value: '0' }] },
      { source: '/admin(.*)',          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, nosnippet' }, { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' }] },
      { source: '/api/webhooks/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },

  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'vuka.co.za' }],
        destination: 'https://www.vuka.co.za/:path*',
        permanent: true,
      },
    ];
  },

  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },

  typescript:  { ignoreBuildErrors: false },
  eslint:      { ignoreDuringBuilds: false },
};

module.exports = nextConfig;
