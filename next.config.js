/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── SECURITY: Never expose admin email to client bundle ──
  // Admin gating must be done server-side only.

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.cloudflare.com',
      },
    ],
  },

  async headers() {
    return [
      {
        // Security headers on all routes
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.payfast.co.za",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              `img-src 'self' data: blob: https://*.r2.dev https://*.supabase.co`,
              "media-src 'self' blob: https://*.r2.dev",
              "frame-src https://js.stripe.com https://www.payfast.co.za",
              "connect-src 'self' https://*.supabase.co https://api.resend.com https://*.r2.cloudflarestorage.com wss://*.supabase.co",
            ].join('; '),
          },
          { key: 'X-Robots-Tag', value: 'index, follow' },
        ],
      },
      {
        source: '/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },

  // Prevent accidental exposure of server-only modules in client bundle
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
};

module.exports = nextConfig;
