// src/components/cms/CmsLandingPage.tsx
// Server component — wraps BlockRenderer with SEO meta injection
import BlockRenderer from './BlockRenderer';
import Footer from '@/components/Footer';
import LandingMusicShowcase from '@/components/LandingMusicShowcase';

// content mirrors Prisma's JsonValue: string | number | boolean | object | array | null
type Block = { id: string; type: string; content: unknown; isVisible: boolean };

type FeaturedArtist = {
  id: string; tagline: string; blurb: string;
  artist: {
    id: string; slug: string; name: string; photoUrl: string; coverUrl: string;
    genreTags: string[]; city: string; country: string; isVerified: boolean; totalPlays: number;
    _count: { beats: number; releases: number; followers: number };
  };
};

type CmsPage = {
  id: string; slug: string; title: string;
  metaTitle: string; metaDesc: string;
  blocks: Block[];
};

interface Props {
  page: CmsPage;
  featuredArtists: FeaturedArtist[];
}

export default function CmsLandingPage({ page, featuredArtists }: Props) {
  // JSON.stringify alone does not stop an attacker-controlled </script> in
  // CMS metadata from terminating this script element. Escape HTML-sensitive
  // characters so the JSON remains valid but cannot break out into markup.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Vuka Music',
    url: 'https://www.vukamusic.com',
    description: page.metaDesc || "Africa's independent music platform. Buy beats and music directly from African artists.",
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.vukamusic.com/store?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

  return (
    <>
      {/* JSON-LD structured data — preserved from original */}
      <script
        type="application/ld+json"
        // nosemgrep: JSON-LD is JSON.stringify output with HTML/script delimiters escaped above.
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <BlockRenderer blocks={page.blocks} featuredArtists={featuredArtists} />
      <LandingMusicShowcase />
      <Footer />
    </>
  );
}
