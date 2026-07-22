
// ============================================================
// VUKA — Public Release Page
// /releases/[id] — supports BOTH Release (beat store) AND
// DistributionRelease (artist distribution uploads).
// Tries store Release first (by slug, then id), then falls
// back to DistributionRelease by id. Admin "Public Page"
// links and artist profile links both resolve correctly.
// ============================================================

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReleasePageClient from './ReleasePageClient';
import prisma from '@/lib/prisma';
import { getEffectivePlan } from '@/lib/plans';

// ── Data fetchers ─────────────────────────────────────────────

async function getStoreRelease(id: string) {
  // Try slug
  const bySlug = await prisma.release.findUnique({
    where: { slug: id },
    include: {
      artist: { select: { name: true, slug: true, photoUrl: true, genreTags: true, planSlug: true, planExpiresAt: true } },
      tracks: { orderBy: { trackNumber: 'asc' } },
    },
  }).catch(() => null);
  if (bySlug) {
    const plan = getEffectivePlan((bySlug.artist as any).planSlug, (bySlug.artist as any).planExpiresAt);
    return { ...bySlug, artistSharePct: plan.artistSharePct, platformFeePct: plan.platformFeePct, _source: 'store' as const };
  }

  // Try id
  const byId = await prisma.release.findUnique({
    where: { id },
    include: {
      artist: { select: { name: true, slug: true, photoUrl: true, genreTags: true, planSlug: true, planExpiresAt: true } },
      tracks: { orderBy: { trackNumber: 'asc' } },
    },
  }).catch(() => null);
  if (byId) {
    const plan = getEffectivePlan((byId.artist as any).planSlug, (byId.artist as any).planExpiresAt);
    return { ...byId, artistSharePct: plan.artistSharePct, platformFeePct: plan.platformFeePct, _source: 'store' as const };
  }

  return null;
}

async function getDistributionRelease(id: string) {
  const release = await prisma.distributionRelease.findUnique({
    where: { id },
    include: {
      artist: { select: { name: true, slug: true, photoUrl: true, genreTags: true } },
      tracks: { orderBy: { trackNumber: 'asc' } },
      dspDeliveries: true,
    },
  }).catch(() => null);

  if (!release || release.status !== 'live') return null;

  // Build playable URL — fileUrl (new uploads) is already a full URL.
  // masterFileUrl on older tracks may be a relative R2 key — build full URL.
  const r2Base = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';
  function toPlayableUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (r2Base) return `${r2Base}/${url}`;
    return null;
  }

  // Normalise to the shape ReleasePageClient expects
  return {
    _source: 'distribution' as const,
    id: release.id,
    slug: release.id,          // use id as slug for canonical URL
    title: release.title,
    releaseType: release.releaseType,
    artworkUrl: release.artworkUrl,
    description: null,
    price: (release as any).price ?? 0,
    payWhatWant: (release as any).payWhatYouWant ?? false,
    minPrice: (release as any).minPrice ?? 0,
    plays: 0,
    artist: release.artist,
    // Map DistributionTrack → track shape the client expects
    tracks: release.tracks.map(t => ({
      id: t.id,
      title: t.title,
      trackNumber: t.trackNumber,
      duration: t.duration ?? 0,
      previewUrl: toPlayableUrl(t.fileUrl || t.masterFileUrl),
      featuredArtists: t.featuredArtists ?? [],
      isrc: t.isrc,
    })),
    dspDeliveries: release.dspDeliveries,
    releaseDate: release.scheduledDate || release.originalReleaseDate || release.createdAt,
    credits: release.pLine || release.cLine
      ? [release.pLine, release.cLine].filter(Boolean).join('\n')
      : null,
    copyrightHolder: release.copyrightHolder || null,
    copyrightYear: release.copyrightYear ?? null,
    upc: release.upc,
    distributor: release.distributor,
    labelName: release.labelName,
  };
}

async function getRelease(id: string) {
  const store = await getStoreRelease(id);
  if (store) return store;
  return getDistributionRelease(id);
}

// ── Metadata ──────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const release = await getRelease(id);
  if (!release) return { title: 'Release not found — Vuka Music' };

  const artistName = release.artist?.name ?? 'Unknown Artist';
  const title      = `${release.title} — ${artistName} | Vuka Music`;
  const description = (release as any).description
    ? `${(release as any).description.slice(0, 150)}…`
    : `Stream "${release.title}" by ${artistName} on Vuka Music.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: release.artworkUrl ? [{ url: release.artworkUrl, width: 1200, height: 1200 }] : [],
      type: 'music.album',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: release.artworkUrl ? [release.artworkUrl] : [],
    },
  };
}

// ── Page ──────────────────────────────────────────────────────

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = await getRelease(id);
  if (!release) notFound();

  return <ReleasePageClient release={release} />;
}
