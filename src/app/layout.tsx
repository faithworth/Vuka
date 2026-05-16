import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vuka — Rise. Buy beats & music directly from African artists.',
  description: 'Premium independent music commerce. Buy beats, EPs, albums directly from producers and artists. Real payments. Real emails. No middleman.',
  openGraph: {
    title: 'Vuka — Rise',
    description: 'Buy beats & music directly from African artists.',
    siteName: 'Vuka',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
