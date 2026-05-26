import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vuka — Buy Beats & Music from African Artists',
  description: "Vuka is Africa's independent music platform. Buy beats and music directly from South African artists and producers. Instant downloads. PayFast & Stripe payments.",
  keywords: ['vuka', 'vuka distro', 'buy beats', 'south african beats', 'african music platform', 'buy music south africa', 'beat store south africa', 'independent music africa', 'payfast beats', 'trap beats south africa'],
  metadataBase: new URL('https://vuka-distro.vercel.app'),
  alternates: { canonical: 'https://vuka-distro.vercel.app' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    title: 'Vuka — Buy Beats & Music from African Artists',
    description: "Africa's independent music platform. Buy beats & releases directly from artists. PayFast & Stripe. Instant downloads.",
    url: 'https://vuka-distro.vercel.app',
    siteName: 'Vuka',
    type: 'website',
    locale: 'en_ZA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vuka — Buy Beats & Music from African Artists',
    description: "Africa's independent music platform. Buy beats & releases directly from artists.",
  },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
