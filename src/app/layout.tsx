import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: 'Vuka Music — Global Music Marketplace',
  description:
    "Vuka Music is a global music marketplace connecting independent artists, producers, fans and music industry professionals. Buy music, beats, merch, tickets and creator services from artists around the world.",
  keywords: [
    'vuka', 'vuka music', 'global music marketplace', 'music marketplace',
    'buy music online', 'buy beats online', 'independent artists', 'music producers',
    'artist marketplace', 'music industry marketplace', 'creator marketplace',
    'music crowdfunding', 'music events', 'global independent music',
    'african music', 'amapiano', 'gqom', 'afrobeats', 'south african music',
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com'),
  alternates: {
    canonical: process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com',
    languages: {
      'x-default': process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com',
      'en': process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com',
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    title: 'Vuka Music — Global Music Marketplace',
    description:
      "A global music marketplace for independent artists, producers, fans and the music industry.",
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com',
    siteName: 'Vuka Music',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vuka Music — Global Music Marketplace',
    description:
      "A global music marketplace for independent artists, producers, fans and the music industry.",
  },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Extract origin from R2 public URL for preconnect (server-only env var is fine here
  // since layout.tsx is a Server Component)
  let r2Origin: string | null = null;
  try {
    if (process.env.CLOUDFLARE_R2_PUBLIC_URL) {
      r2Origin = new URL(process.env.CLOUDFLARE_R2_PUBLIC_URL).origin;
    }
  } catch {}

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        {/* Vuka Music Design System fonts — Syne (headings), DM Sans (body), JetBrains Mono (numbers/code) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Preconnect to R2 CDN so artwork/audio loads start without TCP handshake delay */}
        {r2Origin && <link rel="preconnect" href={r2Origin} />}
        {r2Origin && <link rel="dns-prefetch" href={r2Origin} />}
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': 'https://www.vukamusic.com/#organization',
                  name: 'Vuka Music',
                  alternateName: 'VukaMusic',
                  legalName: 'Voca Music The Rise Up',
                  url: 'https://www.vukamusic.com',
                  logo: 'https://www.vukamusic.com/favicon.svg',
                  description:
                    'Vuka Music is a global music marketplace connecting independent artists, producers, fans and music industry professionals.',
                  areaServed: 'Worldwide',
                  sameAs: [],
                },
                {
                  '@type': 'WebSite',
                  '@id': 'https://www.vukamusic.com/#website',
                  url: 'https://www.vukamusic.com',
                  name: 'Vuka Music',
                  publisher: { '@id': 'https://www.vukamusic.com/#organization' },
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: 'https://www.vukamusic.com/discover?q={search_term_string}',
                    'query-input': 'required name=search_term_string',
                  },
                },
              ],
            }),
          }}
        />
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
