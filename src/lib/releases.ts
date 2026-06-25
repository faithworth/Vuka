/**
 * VUKA — Release Rights & Publishing
 *
 * Vuka is a music sales platform — artists sell their music directly to fans.
 * We are NOT a DSP distributor. There is no Spotify/Apple Music delivery,
 * no ISRC registration, no UPC assignment, no external DSP pipeline.
 *
 * What this module covers:
 *   - Release metadata validation (what makes a release publishable)
 *   - Rights declaration (who owns the copyright, who wrote it, who produced it)
 *   - Release status lifecycle (draft → submitted → approved → live → takedown)
 *   - Status history append (immutable log stored as JSON on each Release)
 *
 * Artists retain 100% of their rights. Vuka only takes a platform fee on sales.
 */

import prisma from './prisma';

// ── Release Status Lifecycle ──────────────────────────────────────────────

export type ReleaseStatus =
  | 'draft'           // Artist still working on it
  | 'submitted'       // Submitted for moderation review
  | 'approved'        // Passed moderation, visible in store
  | 'live'            // Actively selling
  | 'rejected'        // Failed moderation — artist notified with reason
  | 'takedown'        // Removed by artist or admin (copyright, etc.)
  | 'unpublished';    // Artist manually unpublished

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
   * Must be true to publish. Stored on the Release for legal record.
   */
  rightsConfirmed:  boolean;
}

// ── Status History ────────────────────────────────────────────────────────

export interface StatusHistoryEntry {
  status:  string;
  note:    string;
  at:      string; // ISO-8601
  by?:     string; // userId of whoever triggered the change
}

/**
 * Append a new entry to the statusHistory JSON array stored on a Release.
 * Pure function — does NOT write to DB. Returns the updated array.
 */
export function appendStatusHistory(
  existing: StatusHistoryEntry[],
  status:   string,
  note:     string,
  by?:      string,
): StatusHistoryEntry[] {
  const safe = Array.isArray(existing) ? existing : [];
  return [...safe, { status, note, at: new Date().toISOString(), by }];
}

// ── Release Metadata Validation ───────────────────────────────────────────

export interface ReleaseMetadataInput {
  title:           string;
  type:            string;            // 'single' | 'ep' | 'album' | 'mixtape'
  genres:          string[];
  artworkUrl?:     string;
  price?:          number;
  rights:          Partial<RightsDeclaration>;
  tracks: {
    title:           string;
    trackNumber:     number;
    audioFileUrl?:   string;
    composers:       string[];
    producers:       string[];
    featuredArtists: string[];
  }[];
}

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Validate a release before submission for review.
 * Returns { valid, errors, warnings } — never throws.
 */
export function validateReleaseForSubmission(input: ReleaseMetadataInput): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!input.title?.trim())        errors.push('Release title is required.');
  if (!input.type?.trim())         errors.push('Release type is required (single, ep, album, or mixtape).');
  if (!input.genres?.length)       errors.push('At least one genre is required.');
  if (!input.artworkUrl?.trim())   errors.push('Artwork is required before submitting.');
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
    if (!track.composers?.length && !track.producers?.length) {
      warnings.push(`Track ${track.trackNumber}: consider adding composer/producer credits.`);
    }
  }

  if (!input.rights?.copyrightYear) {
    warnings.push(`No copyright year set — defaulting to ${new Date().getFullYear()}.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Status Transitions ────────────────────────────────────────────────────

/**
 * Advance a Release to a new status and record it in statusHistory.
 * Validates that the transition is legal.
 */
export async function advanceReleaseStatus(
  releaseId: string,
  newStatus: ReleaseStatus,
  note:      string,
  by?:       string,
): Promise<void> {
  const release = await prisma.release.findUnique({
    where:  { id: releaseId },
    select: { statusHistory: true, status: true },
  });

  if (!release) throw new Error(`Release ${releaseId} not found`);

  const VALID_TRANSITIONS: Record<string, ReleaseStatus[]> = {
    draft:       ['submitted', 'takedown'],
    submitted:   ['approved', 'rejected', 'draft'],
    approved:    ['live', 'takedown', 'rejected'],
    live:        ['takedown', 'unpublished'],
    rejected:    ['draft', 'submitted'],
    takedown:    ['draft'],
    unpublished: ['live', 'draft'],
  };

  const allowed = VALID_TRANSITIONS[release.status ?? 'draft'] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${release.status} → ${newStatus}. ` +
      `Allowed: ${allowed.join(', ')}`
    );
  }

  const history = appendStatusHistory(
    (release.statusHistory as StatusHistoryEntry[]) ?? [],
    newStatus,
    note,
    by,
  );

  await prisma.release.update({
    where: { id: releaseId },
    data:  { status: newStatus, statusHistory: history },
  });
}

/**
 * Takedown a release immediately (admin action or artist request).
 * Works regardless of current status.
 */
export async function takedownRelease(
  releaseId:  string,
  reason:     string,
  by?:        string,
): Promise<void> {
  const release = await prisma.release.findUnique({
    where:  { id: releaseId },
    select: { statusHistory: true },
  });
  if (!release) throw new Error(`Release ${releaseId} not found`);

  const history = appendStatusHistory(
    (release.statusHistory as StatusHistoryEntry[]) ?? [],
    'takedown',
    reason,
    by,
  );

  await prisma.release.update({
    where: { id: releaseId },
    data:  {
      status:        'takedown',
      statusHistory: history,
    },
  });
}
