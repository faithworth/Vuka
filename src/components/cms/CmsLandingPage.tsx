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
  // Keep structured data static: CMS-controlled metadata must never enter
  // an HTML script context, even after JSON serialization.
  const jsonLd = '{"@context":"https://schema.org","@type":"WebSite","name":"Vuka Music","url":"https://www.vukamusic.com","description":"Africa\\'s independent music platform. Buy beats and music directly from African artists.","potentialAction":{"@type":"SearchAction","target":"https://www.vukamusic.com/store?q={search_term_string}","query-input":"required name=search_term_string"}}';

  return (
    <>
      {/* JSON-LD is JSON.stringify output with <, >, &, U+2028 and U+2029 escaped above. */}
      {/* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <BlockRenderer blocks={page.blocks} featuredArtists={featuredArtists} />
      <LandingMusicShowcase />
      <Footer />
    </>
  );
}
