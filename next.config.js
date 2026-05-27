/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── SECURITY: Do NOT expose ADMIN_EMAIL to client bundle ──
  // Remove the env.NEXT_PUBLIC_ADMIN_EMAIL assignment from Phase 1 — it leaks
  // the admin email into the client JS bundle, making admin accounts trivially
  // discoverable. Admin gating must be done server-side only.

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
    ],
  },

  async headers() {
    return [
      {
        // Security headers on all routes
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options',           value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          // Enforce HTTPS
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Control referrer
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          // Permissions policy — disable unnecessary APIs
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=(self)',
          },
          // Basic CSP — tighten per your actual CDN/font origins
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
          // SEO
          { key: 'X-Robots-Tag', value: 'index, follow' },
        ],
      },
      {
        // Cache static assets aggressively
        source: '/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // No-cache on API routes
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
