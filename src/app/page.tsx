// src/app/page.tsx
// CMS-driven landing page. Fetches published blocks from the DB.
// Falls back to the static LandingPage component until the CMS
// landing page has been configured and published by an admin.
import Navbar from '@/components/Navbar';
import StaticLandingPage from '@/components/LandingPage';
import CmsLandingPage from '@/components/cms/CmsLandingPage';
import { getPublishedPage, getFeaturedArtists } from '@/lib/cms';

export const revalidate = 60; // ISR — revalidate every 60s

export default async function HomePage() {
  const [page, featuredArtists] = await Promise.all([
    getPublishedPage('landing').catch(() => null),
    getFeaturedArtists().catch(() => []),
  ]);

  // If the CMS landing page is published AND has blocks, use it
  if (page && page.blocks.length > 0) {
    return (
      <>
        <Navbar />
        <main style={{ background: 'var(--bg)', color: 'var(--text)' }}>
          <CmsLandingPage page={page} featuredArtists={featuredArtists} />
        </main>
      </>
    );
  }

  // Fallback to the static landing page while the CMS is being configured
  return <StaticLandingPage />;
}
