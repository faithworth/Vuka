/**
 * VUKA — Release Rights & Validation
 *
 * Vuka Music is a music sales platform — artists sell their music directly to
 * fans. We are NOT a DSP distributor. There is no Spotify/Apple Music
 * delivery, no ISRC registration, no UPC assignment, no external DSP
 * pipeline, and no pre-publish review queue — a release goes live the
 * moment the artist publishes it (Release.isActive).
 *
 * What this module covers:
 *   - Rights declaration shape (who owns the copyright, who wrote it, who produced it)
 *   - Release metadata validation (what makes a release publishable)
 *
 * NOTE: an earlier version of this file also exported `advanceReleaseStatus`
 * and `takedownRelease`, which read/wrote `status`/`statusHistory` columns
 * on the Release model. Those columns don't exist on Release (it only has
 * a plain `isActive` boolean) — keeping them would have failed Next.js's
 * type-check the moment anything imported this file. Publish/unpublish/
 * delete already have a working home in the route handlers themselves:
 *   - /api/dashboard/releases   (artist: PATCH isActive, DELETE)
 *   - /api/admin/releases       (admin: activate / deactivate / delete)
 * If you want a persisted, queryable moderation history later, that needs
 * a small additive migration (e.g. `moderationNotes Json[]` on Release) —
 * ask before adding it.
 *
 * Artists retain 100% of their rights. Vuka Music only takes a platform fee on sales.
 */

// ── Rights Declaration ────────────────────────────────────────────────────

export interface RightsDeclaration {
  /** Full legal name of the copyright holder */
  copyrightHolder:  string;
  /** Copyright year (defaults to current year) */
  copyrightYear?:   number;
  /** Songwriters / composers */
  composers:        string[];
  /** Producers who worked on the track */
  producers:        string[];
  /** Featured artists */
  featuredArtists:  string[];
  /**
   * Artist confirms they own or control the rights to this content.
   * Must be true to publish.
   */
  rightsConfirmed:  boolean;
}

// ── Release Metadata Validation ───────────────────────────────────────────

export interface ReleaseMetadataInput {
  title:           string;
  type:            string;            // 'single' | 'ep' | 'album' | 'mixtape'
  artworkUrl?:     string;
  price?:          number;
  rights:          Partial<RightsDeclaration>;
  tracks: {
    title:           string;
    trackNumber:     number;
    audioFileUrl?:   string;
  }[];
}

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Validate a release before it's published.
 * Returns { valid, errors, warnings } — never throws.
 */
export function validateReleaseForSubmission(input: ReleaseMetadataInput): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!input.title?.trim())        errors.push('Release title is required.');
  if (!input.type?.trim())         errors.push('Release type is required (single, ep, album, or mixtape).');
  if (!input.artworkUrl?.trim())   errors.push('Artwork is required before publishing.');
  if (!input.tracks?.length)       errors.push('At least one track is required.');

  if (!input.rights?.rightsConfirmed) {
    errors.push('You must confirm that you own or control the rights to this content.');
  }
  if (!input.rights?.copyrightHolder?.trim()) {
    errors.push('Copyright holder name is required.');
  }

  if (input.price !== undefined && input.price < 0) {
    errors.push('Price cannot be negative.');
  }
  if (input.price === 0) {
    warnings.push('This release is set to free — artists typically earn more with even a small price.');
  }

  for (const track of input.tracks ?? []) {
    if (!track.title?.trim()) {
      errors.push(`Track ${track.trackNumber}: title is required.`);
    }
    if (!track.audioFileUrl?.trim()) {
      errors.push(`Track ${track.trackNumber}: audio file is required.`);
    }
  }

  if (!input.rights?.copyrightYear) {
    warnings.push(`No copyright year set — defaulting to ${new Date().getFullYear()}.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
