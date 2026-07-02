// ============================================================
// VUKA CMS Core Library
// src/lib/cms/index.ts
// ============================================================
import prisma from '@/lib/prisma';

export const CMS_ADMIN_ROLES  = ['owner', 'super_admin', 'admin'];
export const CMS_EDITOR_ROLES = [...CMS_ADMIN_ROLES, 'moderator'];

export const canAccessCms = (role: string) => CMS_EDITOR_ROLES.includes(role);
export const canPublish   = (role: string) => CMS_ADMIN_ROLES.includes(role);
export const canDelete    = (role: string) => ['owner', 'super_admin'].includes(role);

// ── Block catalogue ──────────────────────────────────────────
export const BLOCK_TYPES = [
  { type: 'hero',          label: 'Hero Banner',       icon: '🎯', desc: 'Full-width headline with CTA buttons' },
  { type: 'text',          label: 'Text',              icon: '📝', desc: 'Paragraph or heading text' },
  { type: 'rich_text',     label: 'Rich Text',         icon: '✍️',  desc: 'Formatted HTML content' },
  { type: 'image',         label: 'Image',             icon: '🖼️',  desc: 'Single image with alt & caption' },
  { type: 'video',         label: 'Video Embed',       icon: '🎥', desc: 'YouTube or Vimeo embed' },
  { type: 'cta',           label: 'Call to Action',    icon: '🚀', desc: 'Button row or action section' },
  { type: 'features_grid', label: 'Features Grid',     icon: '⚡', desc: 'Grid of feature cards with icons' },
  { type: 'pricing',       label: 'Pricing Cards',     icon: '💰', desc: 'Pricing tier cards' },
  { type: 'artists_grid',  label: 'Featured Artists',  icon: '🎵', desc: 'Showcases featured artists' },
  { type: 'stats',         label: 'Stats Row',         icon: '📊', desc: 'Highlighted metrics row' },
  { type: 'faq',           label: 'FAQ',               icon: '❓', desc: 'Collapsible Q&A' },
  { type: 'banner',        label: 'Banner / Alert',    icon: '📢', desc: 'Coloured announcement strip' },
  { type: 'testimonials',  label: 'Testimonials',      icon: '💬', desc: 'Quote cards' },
  { type: 'steps',         label: 'How It Works',      icon: '👣', desc: 'Numbered step-by-step flow' },
  { type: 'callout',       label: 'Callout',           icon: '📣', desc: 'Highlighted box with optional CTA' },
  { type: 'split_content', label: 'Split Content',     icon: '⬛', desc: 'Two-column text + cards layout' },
  { type: 'spacer',        label: 'Spacer',            icon: '↕️',  desc: 'Vertical spacing' },
  { type: 'html',          label: 'Custom HTML',       icon: '🔧', desc: 'Raw HTML (admins only)' },
] as const;

export type BlockType = typeof BLOCK_TYPES[number]['type'];

// ── Default content per block type ───────────────────────────
// These defaults are used when a new block is added in the CMS editor.
// They mirror the static LandingPage.tsx exactly so a freshly-built
// CMS page looks identical to the hardcoded fallback.
export function defaultBlockContent(type: BlockType): Record<string, unknown> {
  switch (type) {

    case 'hero':
      return {
        badge:        "Africa's independent music platform",
        headline:     "Your music.\nYour terms.\nYour money.",
        subheadline:  'Sell beats and releases directly to your fans — in South Africa and worldwide. Keep up to 95% of every sale.',
        subline:      'Paystack for South African buyers. Money goes directly to your bank. Start free — upgrade anytime for a lower platform fee.',
        notice:       'Free plan: 10% platform fee, auto-reduces to 8.5% as you sell more. Pro plan: 8%. Label plan: 5%. No hidden charges.',
        cta_primary:   { label: "Start Selling — It's Free", href: '/auth/register' },
        cta_secondary: { label: 'Browse the Store',          href: '/store' },
        stats: [
          { value: '90%',  label: 'Artist keeps (Free)',  sub: 'up to 95% on paid plans' },
          { value: '10%',  label: 'Platform Fee',         sub: 'Free plan — drops to 8.5% as you sell more' },
          { value: 'ZAR',  label: 'Paid in Rands' },
        ],
      };

    case 'text':
      return { heading: '', body: 'Enter your text here.', align: 'left' };

    case 'rich_text':
      return { html: '<p>Enter your content here.</p>' };

    case 'image':
      return { src: '', alt: '', caption: '', rounded: true };

    case 'video':
      return { url: '', caption: '' };

    case 'cta':
      return {
        heading:    'Ready to get started?',
        subheading: '',
        buttons: [
          { label: 'Get Started Free', href: '/auth/register', variant: 'primary'   },
          { label: 'Browse Store',     href: '/store',         variant: 'secondary' },
        ],
      };

    // Matches the "For Artists & Producers" section in LandingPage.tsx
    case 'features_grid':
      return {
        heading:    'Everything you need to get paid',
        subheading: 'Upload your music in minutes. Set your price. Fans buy directly. Start on Free — upgrade to keep more.',
        columns:    4,
        features: [
          { icon: '💵', title: 'Dual Payments',    desc: 'Paystack for South African buyers with instant EFT, card, and bank transfer support. Flutterwave for Pan-African payments. Both fully automated.' },
          { icon: '⚡', title: 'Instant Downloads', desc: 'Fans receive secure download links the moment payment clears. No manual work needed.' },
          { icon: '🛡️', title: 'Beat Licensing',   desc: 'Basic, Premium, and Exclusive tiers. Auto-generated PDF license agreements sent to every buyer.' },
          { icon: '👥', title: 'Fan Support',       desc: 'Let fans tip you and back your recording goals. Build a real community around your music.' },
        ],
      };

    // Matches the exact pricing section in LandingPage.tsx
    case 'pricing':
      return {
        heading:    'Honest pricing. Always.',
        subheading: "Start free. Upgrade when you're ready to keep more of what you earn.",
        footnote:   'All plans include Paystack + Flutterwave payments, PDF license generation, secure download delivery, and full analytics. No hidden charges.',
        tiers: [
          {
            name: 'Free', price: 'R0', period: 'forever', keep: '90%', highlight: false,
            features: [
              'Up to 2 releases/month',
              'Beat store & licensing',
              'Fan memberships',
              'PDF license generation',
              'Paystack + Flutterwave',
              'Fee drops to 8.5% automatically as you sell more',
            ],
            cta: { label: 'Get Started Free', href: '/auth/register' },
          },
          {
            name: 'Pro', price: 'R249', period: 'per month', keep: '92%', highlight: true,
            features: [
              'Unlimited releases',
              '8% platform fee',
              'Priority support',
              'Advanced analytics',
              'Industry marketplace access',
              'Everything in Free',
            ],
            cta: { label: 'Start Pro', href: '/auth/register' },
          },
          {
            name: 'Label', price: 'R999', period: 'per month', keep: '95%', highlight: false,
            features: [
              'Unlimited releases',
              '5% platform fee',
              'Multiple artists under one account',
              'Bulk payout management',
              'White-label storefront',
              'Everything in Pro',
            ],
            cta: { label: 'Start Label', href: '/auth/register' },
          },
        ],
      };

    case 'artists_grid':
      return { heading: 'Featured Artists', subheading: 'Discover incredible talent on Vuka.', max: 6 };

    case 'stats':
      return {
        items: [
          { value: '10,000+', label: 'Artists on Vuka'  },
          { value: '50,000+', label: 'Tracks uploaded'   },
          { value: 'R2M+',    label: 'Paid to artists'  },
        ],
      };

    case 'faq':
      return {
        heading: 'Frequently Asked Questions',
        items: [
          { q: 'How do I get paid?',          a: 'Payments are processed via Paystack (South Africa) and Flutterwave (rest of Africa). Money is sent to your bank account within 48 hours of a sale.' },
          { q: 'What is the platform fee?',   a: 'Free plan: 10% (auto-drops to 8.5% as you sell more). Pro: 8%. Label: 5%. Fees are deducted automatically at checkout.' },
          { q: 'Can I sell internationally?', a: 'Yes — Vuka supports international buyers via card through Flutterwave. Your earnings are converted to ZAR.' },
        ],
      };

    case 'banner':
      return { text: 'New announcement coming soon!', variant: 'info', link: '', linkLabel: '' };

    case 'testimonials':
      return {
        heading: 'What artists say',
        items: [
          { quote: 'Vuka changed how I sell my music. I keep so much more.',  author: 'DJ Khali',   role: 'Hip-Hop Producer, Cape Town' },
          { quote: 'Finally a platform built for African artists.',            author: 'Amara Soul', role: 'Afrobeats Artist, Durban'    },
        ],
      };

    // Matches the "From studio to sold" section in LandingPage.tsx
    case 'steps':
      return {
        heading: 'From studio to sold — in minutes',
        items: [
          { n: '01', title: 'Upload your music',  desc: 'Add your beats or releases. Set your prices, license tiers, and artwork. We handle the rest.' },
          { n: '02', title: 'Share your link',    desc: 'Get your personal store link — vukamusic.com/artist/you. Share it everywhere you already are.' },
          { n: '03', title: 'Get paid directly',  desc: 'Paystack and Flutterwave move money directly to your bank account. Keep up to 95% of every sale.' },
        ],
      };

    // Matches the "Industry Portal" callout in LandingPage.tsx
    case 'callout':
      return {
        eyebrow: 'Industry Portal',
        heading: 'Scouts, Labels & Promoters — built in.',
        body:    'Discover emerging talent, close deals, and manage artists directly on Vuka. Built for recruiters, sync buyers, sponsors, and artist managers.',
        cta:     { label: 'Industry Portal', href: '/industry' },
        note:    'Free to apply',
      };

    // Matches the "For Fans & Listeners" section in LandingPage.tsx
    case 'split_content':
      return {
        eyebrow: 'For Fans & Listeners',
        heading: 'Support the artists you love',
        body:    'Discover independent artists from across Africa and the diaspora. Buy their music directly — money goes straight to the artist.',
        checklist: [
          'Browse and stream previews before you buy',
          'Secure checkout via Paystack or card',
          'Instant download links in your inbox',
          'Follow artists and get notified of new drops',
          'Tip artists and back their recording goals',
        ],
        cta: { label: 'Create a Fan Account', href: '/auth/register?role=fan' },
        cards: [
          { icon: '🌍', title: 'Global Discovery', desc: 'Artists from SA, Nigeria, Ghana, Kenya and beyond.'    },
          { icon: '📈', title: 'Support Goals',     desc: "Back an artist's recording or tour fund directly."     },
          { icon: '🎵', title: 'Build a Library',   desc: 'Your purchases available for download anytime.'        },
          { icon: '🛡️', title: 'Safe & Secure',     desc: 'Protected checkout. Immediate delivery.'               },
        ],
      };

    case 'spacer':
      return { height: 64 };

    case 'html':
      return { code: '<!-- Custom HTML -->' };

    default:
      return {};
  }
}

// ── DB helpers ───────────────────────────────────────────────
export async function getCmsPage(idOrSlug: string) {
  const page = await prisma.cmsPage.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      blocks: { orderBy: { order: 'asc' } },
      collaborators: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
      comments: { orderBy: { createdAt: 'desc' } },
    },
  });
  return page;
}

export async function getPublishedPage(slug: string) {
  return prisma.cmsPage.findFirst({
    where: { slug, status: 'published' },
    include: { blocks: { where: { isVisible: true }, orderBy: { order: 'asc' } } },
  });
}

export async function getAllPages() {
  return prisma.cmsPage.findMany({
    orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true, slug: true, title: true, description: true,
      status: true, isSystem: true, publishedAt: true, updatedAt: true, createdById: true,
      _count: { select: { blocks: true, collaborators: true, comments: true } },
    },
  });
}

export async function getFeaturedArtists() {
  return prisma.featuredArtist.findMany({
    where: { isVisible: true },
    orderBy: { order: 'asc' },
    include: {
      artist: {
        select: {
          id: true, slug: true, name: true, photoUrl: true, coverUrl: true,
          genreTags: true, city: true, country: true, isVerified: true, totalPlays: true,
          _count: { select: { beats: true, releases: true, followers: true } },
        },
      },
    },
  });
}

export async function getAllFeaturedArtists() {
  return prisma.featuredArtist.findMany({
    orderBy: { order: 'asc' },
    include: {
      artist: {
        select: {
          id: true, slug: true, name: true, photoUrl: true,
          genreTags: true, city: true, isVerified: true,
          _count: { select: { followers: true, beats: true } },
        },
      },
    },
  });
}

export async function createRevision(pageId: string, createdById: string, summary: string) {
  const blocks = await prisma.cmsBlock.findMany({
    where: { pageId },
    orderBy: { order: 'asc' },
  });
  return prisma.cmsRevision.create({
    data: {
      pageId,
      createdById,
      summary,
      blocks: blocks as unknown as import('@prisma/client').Prisma.JsonArray,
    },
  });
}

export async function getRevisions(pageId: string) {
  return prisma.cmsRevision.findMany({
    where: { pageId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, summary: true, createdAt: true, createdById: true },
  });
}
