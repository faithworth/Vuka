/**
 * VUKA — Dynamic Sitemap
 *
 * Pulls live artist profiles, beats, and releases from the database.
 * These are the highest-value SEO pages — Google needs to know they exist.
 *
 * Updated on every request (Next.js ISR handles caching at the CDN layer).
 * Static pages are inlined; dynamic pages are queried in parallel.
 *
 * Excluded: /admin, /dashboard, /api/*, /auth/* (via robots.ts)
 */

import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

const BASE = 'https://www.vukamusic.com';

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: BASE,                          lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0  },
  { url: `${BASE}/store`,              lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9  },
  { url: `${BASE}/store/beats`,        lastModified: new Date(), changeFrequency: 'daily',   priority: 0.85 },
  { url: `${BASE}/store/releases`,     lastModified: new Date(), changeFrequency: 'daily',   priority: 0.85 },
  { url: `${BASE}/store/videos`,       lastModified: new Date(), changeFrequency: 'daily',   priority: 0.75 },
  { url: `${BASE}/store/samples`,      lastModified: new Date(), changeFrequency: 'daily',   priority: 0.75 },
  { url: `${BASE}/discover`,           lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8  },
  { url: `${BASE}/marketplace`,        lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8  },
  { url: `${BASE}/industry`,           lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.75 },
  { url: `${BASE}/auth/register`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7  },
  { url: `${BASE}/auth/login`,         lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5  },
  { url: `${BASE}/legal/terms`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3  },
  { url: `${BASE}/legal/privacy`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3  },
  { url: `${BASE}/legal/dmca`,         lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3  },
  { url: `${BASE}/legal/refunds`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    // ── Fetch dynamic pages in parallel ─────────────────────────────────
    const [artists, beats, releases, events] = await Promise.all([

      // Artist profiles (public, verified or has content)
      prisma.artist.findMany({
        where: {
          isPublic:     true,
        },
        select:  { slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    5_000,
      }).catch(() => []),

      // Beats — published and for sale
      prisma.beat.findMany({
        where: {
          isActive: true,
        },
        select:  { slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    10_000,
      }).catch(() => []),

      // Releases — active
      prisma.release.findMany({
        where: {
          isActive: true,
        },
        select:  { slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    10_000,
      }).catch(() => []),

      // Events — upcoming and published
      prisma.event.findMany({
        where: {
          startDate: { gte: new Date() },
          status:    'published',
        },
        select:  { slug: true, updatedAt: true },
        orderBy: { startDate: 'asc' },
        take:    500,
      }).catch(() => []),

    ]);

    const artistRoutes: MetadataRoute.Sitemap = artists
      .filter((a) => a.slug)
      .map((a) => ({
        url:             `${BASE}/artist/${a.slug}`,
        lastModified:    a.createdAt,
        changeFrequency: 'weekly',
        priority:        0.8,
      }));

    const beatRoutes: MetadataRoute.Sitemap = beats
      .filter((b) => b.slug)
      .map((b) => ({
        url:             `${BASE}/beats/${b.slug}`,
        lastModified:    b.createdAt,
        changeFrequency: 'weekly',
        priority:        0.7,
      }));

    const releaseRoutes: MetadataRoute.Sitemap = releases
      .filter((r) => r.slug)
      .map((r) => ({
        url:             `${BASE}/release/${r.slug}`,
        lastModified:    r.createdAt,
        changeFrequency: 'weekly',
        priority:        0.75,
      }));

    const eventRoutes: MetadataRoute.Sitemap = events
      .filter((e) => e.slug)
      .map((e) => ({
        url:             `${BASE}/events/${e.slug}`,
        lastModified:    e.updatedAt,
        changeFrequency: 'daily',
        priority:        0.65,
      }));

    return [
      ...STATIC_ROUTES,
      ...artistRoutes,
      ...beatRoutes,
      ...releaseRoutes,
      ...eventRoutes,
    ];

  } catch {
    // DB unavailable — return static routes only, never crash the build
    return STATIC_ROUTES;
  }
}
