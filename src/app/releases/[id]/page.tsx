// ============================================================
// VUKA — Public Release Page (Phase 4)
// /releases/[id] — canonical public URL for a release.
// Supports slug OR cuid ID in the [id] param.
// Also acts as SEO target page for distribution "listen on" links.
// ============================================================

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReleasePageClient from './ReleasePageClient';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.app';

async function getRelease(id: string) {
  try {
    // Try by slug first, then by ID
    const bySlug = await fetch(`${APP_URL}/api/store/releases?slug=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    if (bySlug.ok) {
      const data = await bySlug.json();
      if (data.releases?.[0]) return data.releases[0];
    }
    // Fall back to ID
    const byId = await fetch(`${APP_URL}/api/store/releases?id=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    if (byId.ok) {
      const data = await byId.json();
      if (data.releases?.[0]) return data.releases[0];
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const release = await getRelease(params.id);
  if (!release) return { title: 'Release not found — Vuka' };

  const artistName = release.artist?.name ?? 'Unknown Artist';
  const title      = `${release.title} — ${artistName} | Vuka`;
  const description = release.description
    ? `${release.description.slice(0, 150)}…`
    : `Stream and buy "${release.title}" by ${artistName} on Vuka.`;

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

export default async function ReleasePage({ params }: { params: { id: string } }) {
  const release = await getRelease(params.id);
  if (!release) notFound();

  return <ReleasePageClient release={release} />;
}
