/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',  value: 'on' },
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(self), microphone=(), geolocation=()' },
  {
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key:   'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js inline scripts + PayPal SDK
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://js.paystack.co",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // R2 CDN for audio/images + Supabase storage
      `img-src 'self' data: blob: https://*.r2.dev https://*.supabase.co`,
      `media-src 'self' blob: https://*.r2.dev https://*.cloudflare.com`,
      // PayPal, Paystack, Supabase, Resend
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://api-m.paypal.com https://api-m.sandbox.paypal.com https://api.resend.com https://*.upstash.io https://app.posthog.com https://*.r2.cloudflarestorage.com https://*.r2.dev",
      "frame-src https://www.paypal.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "object-src 'none'",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: 'pub-*.r2.dev' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.cloudflare.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year — R2 assets are immutable (content-addressed)
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // Relax CSP for API routes that handle webhooks
      {
        source: '/api/webhooks/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
    ];
  },

  // Next.js 15: stable top-level option (was experimental.serverComponentsExternalPackages in 14.x)
  serverExternalPackages: ['@prisma/client', 'prisma'],

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tooltip',
      'date-fns',
      'recharts',
    ],
  },

  webpack(config) {
    // Suppress Prisma's "Can't resolve 'fs'" warnings in the browser bundle
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

module.exports = nextConfig;
