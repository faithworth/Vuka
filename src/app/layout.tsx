import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vuka. Buy music and beats',
  description: 'Buy beats and music directly from African artists. Real payments, instant downloads.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Vuka. Buy music and beats',
    description: 'Buy beats and music directly from African artists.',
    siteName: 'Vuka',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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
