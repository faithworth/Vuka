import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import CelebrationBadge from '@/components/CelebrationBadge';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: 'Vuka Music — Sell Beats, Releases & Tickets Direct to Fans',
  description:
    "Vuka Music is the direct-to-fan sales platform for South African independent artists and producers. Sell beats, releases, event tickets, merch and more — keep up to 95% of every sale, paid straight to your bank via Paystack.",
  keywords: [
    'vuka', 'vuka music', 'sell beats south africa',
    'south african music platform', 'african beat marketplace',
    'sell music direct to fans', 'independent music artist sa',
    'amapiano beats', 'gqom beats', 'afrobeats producer marketplace',
    'paystack music', 'sell tickets south africa', 'artist crowdfunding south africa',
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com'),
  alternates: { canonical: process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    title: 'Vuka Music — Sell Beats, Releases & Tickets Direct to Fans',
    description:
      "South Africa's direct-to-fan sales platform for independent artists and producers. Keep up to 95% of every sale, paid straight to your bank via Paystack.",
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://www.vukamusic.com',
    siteName: 'Vuka Music',
    type: 'website',
    locale: 'en_ZA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vuka Music — Sell Beats, Releases & Tickets Direct to Fans',
    description:
      "South Africa's direct-to-fan sales platform for independent artists and producers. Keep up to 95% of every sale.",
  },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        {/* Vuka Music Design System fonts — Syne (headings), DM Sans (body), JetBrains Mono (numbers/code) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
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
                    'Vuka Music is the direct-to-fan sales platform for South African independent artists and producers to sell beats, releases, event tickets, and merch.',
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
