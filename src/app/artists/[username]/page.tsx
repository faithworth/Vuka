// ============================================================
// VUKA — /artists/[username] canonical public profile route
// Redirects to /artist/[slug] which has the full implementation.
// Supports both the spec URL format (/artists/username) and
// the existing implementation (/artist/slug).
// ============================================================

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

interface Props {
  params: { username: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `${params.username} — Vuka`,
    description: `Listen to ${params.username} on Vuka`,
  };
}

export default function ArtistUsernameRedirect({ params }: Props) {
  // Canonical redirect: /artists/username → /artist/slug
  redirect(`/artist/${params.username}`);
}
