
// ============================================================
// VUKA — /artists/[username] canonical public profile route
// Redirects to /artist/[slug] which has the full implementation.
// Supports both the spec URL format (/artists/username) and
// the existing implementation (/artist/slug).
// ============================================================

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} — Vuka Music`,
    description: `Listen to ${username} on Vuka Music`,
  };
}

export default async function ArtistUsernameRedirect({ params }: Props) {
  const { username } = await params;
  // Canonical redirect: /artists/username → /artist/slug
  redirect(`/artist/${username}`);
}
