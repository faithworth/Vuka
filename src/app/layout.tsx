import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import CelebrationBadge from '@/components/CelebrationBadge';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: 'Vuka Music — Africa\'s Digital Music Store',
  description:
    "Vuka Music sells beats, releases, merch, event tickets, and creator services from South African independent artists. Buyers purchase from Vuka Music — artists earn a weekly royalty of up to 95% per sale, paid to their bank account.",
  keywords: [
    'vuka', 'vuka music', 'buy beats south africa',
    'south african music store', 'african music platform',
    'buy music online south africa', 'independent music artist sa',
    'amapiano beats', 'gqom beats', 'afrobeats producer',
    'music store south africa', 'buy tickets south africa', 'artist crowdfunding south africa',
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com'),
  alternates: { canonical: process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    title: 'Vuka Music — Africa\'s Digital Music Store',
    description:
      "South Africa's digital music store. Buy beats, releases, merch and creator services. Artists earn up to 95% royalty per sale, paid weekly.",
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com',
    siteName: 'Vuka Music',
    type: 'website',
    locale: 'en_ZA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vuka Music — Africa\'s Digital Music Store',
    description:
      "South Africa's digital music store. Buy beats, releases, merch and creator services. Artists earn up to 95% royalty per sale.",
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
                  url: 'https://www.vukamusic.com',
                  logo: 'https://www.vukamusic.com/favicon.svg',
                  description:
                    'Vuka Music is Africa\'s digital music store. We sell beats, releases, event tickets, merch and creator services from South African independent artists. Artists earn a weekly royalty of up to 95% per sale.',
                  areaServed: 'ZA',
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
        <CelebrationBadge />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
