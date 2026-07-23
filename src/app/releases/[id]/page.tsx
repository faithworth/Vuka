
// ============================================================
// VUKA — Public Release Page
// /releases/[id] — Vuka Music is direct-to-fan only, so this
// resolves against the Release model (by slug, then id).
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

async function getRelease(id: string) {
  return getStoreRelease(id);
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
