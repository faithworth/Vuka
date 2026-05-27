// ============================================================
// PHASE 2 — src/lib/distribution.ts
// DistributionEngine: ISRC/UPC generation, metadata validation,
// DSP delivery pipeline, status lifecycle, retry + rollback.
// ============================================================

import prisma from './prisma';

// ── Supported DSPs ────────────────────────────────────────────
export const SUPPORTED_DSPS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'tiktok',
  'deezer',
  'audiomack',
  'amazon_music',
] as const;

export type DSP = typeof SUPPORTED_DSPS[number];

// ── Status Lifecycle ──────────────────────────────────────────
export const DISTRIBUTION_STATUSES = [
  'draft',
  'metadata_review',
  'artwork_review',
  'approved',
  'scheduled',
  'delivering',
  'live',
  'failed',
  'takedown',
] as const;

export type DistributionStatus = typeof DISTRIBUTION_STATUSES[number];

// ── ISRC Generator ────────────────────────────────────────────
// Format: CC-XXX-YY-NNNNN
// CC = country code, XXX = registrant, YY = year, NNNNN = designation
const REGISTRANT_CODE = process.env.ISRC_REGISTRANT || 'ZAV'; // ZA = South Africa, V = Vuka

export function generateISRC(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const designation = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, '0');
  return `ZA-${REGISTRANT_CODE}-${year}-${designation}`;
}

// ── UPC Generator ─────────────────────────────────────────────
// 12-digit UPC-A with check digit
// In production, purchase a UPC prefix from GS1 South Africa.
// These generated UPCs use a dev prefix and must be replaced before live distrib.
const UPC_PREFIX = process.env.UPC_PREFIX || '860000000'; // 9 digits

export function generateUPC(): string {
  const suffix = Math.floor(Math.random() * 999).toString().padStart(3, '0');
  const digits = (UPC_PREFIX + suffix).split('').map(Number);
  // EAN-13 check digit algorithm
  const checkDigit =
    (10 -
      (digits.reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3), 0) % 10)) %
    10;
  return digits.join('') + checkDigit;
}

// ── Metadata Validation ───────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ReleaseMetadata {
  title: string;
  artistName: string;
  releaseType: string;
  primaryGenre: string;
  artworkUrl: string;
  artworkStatus: string;
  targetDSPs: string[];
  tracks: {
    title: string;
    trackNumber: number;
    masterFileUrl: string;
    masterFileStatus: string;
    isrc?: string;
  }[];
  copyrightHolder?: string;
  copyrightYear?: number;
}

export function validateReleaseMetadata(meta: ReleaseMetadata): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!meta.title?.trim())      errors.push('Release title is required');
  if (!meta.artistName?.trim()) errors.push('Artist name is required');
  if (!meta.primaryGenre)       errors.push('Primary genre is required');
  if (!meta.artworkUrl)         errors.push('Artwork is required');
  if (!meta.targetDSPs?.length) errors.push('At least one DSP target must be selected');
  if (!meta.tracks?.length)     errors.push('At least one track is required');

  // Artwork checks
  if (meta.artworkUrl && meta.artworkStatus !== 'approved') {
    if (meta.artworkStatus === 'rejected') {
      errors.push('Artwork was rejected — please upload a new artwork image');
    } else {
      warnings.push('Artwork is pending review — release will not proceed until approved');
    }
  }

  // Track checks
  meta.tracks.forEach((t, i) => {
    const n = i + 1;
    if (!t.title?.trim())        errors.push(`Track ${n}: title is required`);
    if (!t.masterFileUrl)        errors.push(`Track ${n}: master audio file is required`);
    if (t.masterFileStatus === 'rejected') {
      errors.push(`Track ${n}: master file was rejected — please re-upload`);
    }
    if (t.trackNumber !== n)     warnings.push(`Track ${n}: track number mismatch (expected ${n}, got ${t.trackNumber})`);
  });

  // DSP validation
  const invalidDSPs = meta.targetDSPs.filter(d => !SUPPORTED_DSPS.includes(d as DSP));
  if (invalidDSPs.length) errors.push(`Unsupported DSPs: ${invalidDSPs.join(', ')}`);

  // Warnings
  if (!meta.copyrightHolder) warnings.push('Copyright holder not specified — defaults to artist name');
  if (!meta.copyrightYear)   warnings.push('Copyright year not specified');

  return { valid: errors.length === 0, errors, warnings };
}

// ── Status History Helper ─────────────────────────────────────
export function appendStatusHistory(
  existing: any[],
  status: string,
  notes = ''
): any[] {
  return [
    ...existing,
    { status, timestamp: new Date().toISOString(), notes },
  ];
}

// ── Advance Release Status ────────────────────────────────────
export async function advanceReleaseStatus(
  releaseId: string,
  toStatus: DistributionStatus,
  notes = ''
): Promise<{ success: boolean; error?: string }> {
  try {
    const release = await prisma.distributionRelease.findUnique({
      where: { id: releaseId },
    });
    if (!release) return { success: false, error: 'Release not found' };

    const history = appendStatusHistory(
      release.statusHistory as any[],
      toStatus,
      notes
    );

    await prisma.distributionRelease.update({
      where: { id: releaseId },
      data: {
        status: toStatus,
        statusHistory: history,
        adminNotes: notes || release.adminNotes,
        ...(toStatus === 'live' ? { releasedAt: new Date() } : {}),
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error('[Distribution] advanceReleaseStatus error:', err?.message);
    return { success: false, error: err?.message };
  }
}

// ── Initiate DSP Delivery Pipeline ───────────────────────────
// In production: each DSP has a real delivery adapter.
// Architecture supports plugging in DDEx XML, Apple Music API, etc.
export async function initiateDeliveryPipeline(
  releaseId: string
): Promise<{ success: boolean; deliveries: any[]; errors: string[] }> {
  const release = await prisma.distributionRelease.findUnique({
    where: { id: releaseId },
    include: { tracks: true },
  });
  if (!release) return { success: false, deliveries: [], errors: ['Release not found'] };

  const validation = validateReleaseMetadata({
    title: release.title,
    artistName: release.artistName,
    releaseType: release.releaseType,
    primaryGenre: release.primaryGenre,
    artworkUrl: release.artworkUrl,
    artworkStatus: release.artworkStatus,
    targetDSPs: release.targetDSPs,
    tracks: release.tracks.map(t => ({
      title: t.title,
      trackNumber: t.trackNumber,
      masterFileUrl: t.masterFileUrl,
      masterFileStatus: t.masterFileStatus,
      isrc: t.isrc || undefined,
    })),
    copyrightHolder: release.copyrightHolder,
    copyrightYear: release.copyrightYear || undefined,
  });

  if (!validation.valid) {
    return { success: false, deliveries: [], errors: validation.errors };
  }

  // Create DSPDelivery records for each target DSP
  // Use findFirst + create/update since there's no unique constraint on (releaseId, dsp)
  const deliveries = await Promise.all(
    release.targetDSPs.map(async (dsp) => {
      const existing = await prisma.dSPDelivery.findFirst({
        where: { distributionReleaseId: releaseId, dsp },
      });
      const payload = buildDeliveryPayload(release, dsp);
      if (existing) {
        return prisma.dSPDelivery.update({
          where: { id: existing.id },
          data: { status: 'queued', deliveryPayload: payload },
        });
      }
      return prisma.dSPDelivery.create({
        data: {
          distributionReleaseId: releaseId,
          dsp,
          status: 'queued',
          deliveryPayload: payload,
        },
      });
    })
  );

  // Advance release status
  await advanceReleaseStatus(releaseId, 'delivering', 'Delivery pipeline initiated');

  return { success: true, deliveries, errors: [] };
}

// ── Build Delivery Payload (DDEx-like structure) ──────────────
function buildDeliveryPayload(release: any, dsp: string): Record<string, any> {
  return {
    schemaVersion: '2.0',
    dsp,
    release: {
      id: release.id,
      upc: release.upc,
      title: release.title,
      artist: release.artistName,
      featuredArtists: release.featuredArtists,
      type: release.releaseType,
      genre: release.primaryGenre,
      language: release.language,
      label: release.labelName || 'Self-Released',
      copyright: {
        holder: release.copyrightHolder,
        year: release.copyrightYear,
        pLine: release.pLine,
        cLine: release.cLine,
      },
      artworkUrl: release.artworkUrl,
      scheduledDate: release.scheduledDate,
      tracks: release.tracks?.map((t: any) => ({
        isrc: t.isrc,
        trackNumber: t.trackNumber,
        title: t.title,
        explicit: t.explicit,
        language: t.language,
        fileUrl: t.masterFileUrl,
        composers: t.composers,
        producers: t.producers,
      })),
    },
    submittedAt: new Date().toISOString(),
  };
}

// ── Submit to DSP (simulated — hook real adapters here) ───────
export async function submitToDSP(
  deliveryId: string
): Promise<{ success: boolean; dspReferenceId?: string; error?: string }> {
  const delivery = await prisma.dSPDelivery.findUnique({
    where: { id: deliveryId },
    include: { distributionRelease: true },
  });
  if (!delivery) return { success: false, error: 'Delivery record not found' };

  try {
    await prisma.dSPDelivery.update({
      where: { id: deliveryId },
      data: { status: 'submitting', submittedAt: new Date() },
    });

    // ── Real DSP adapter hooks ────────────────────────────────
    // In production, each DSP has a dedicated adapter:
    // const result = await dspAdapters[delivery.dsp].submit(delivery.deliveryPayload);
    // For now: mark as 'submitted' with a mock reference ID.
    // Replace with: Spotify for Artists API, Apple MusicKit, etc.
    const mockRefId = `${delivery.dsp.toUpperCase()}-${Date.now()}`;

    await prisma.dSPDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'submitted',
        dspReferenceId: mockRefId,
      },
    });

    return { success: true, dspReferenceId: mockRefId };
  } catch (err: any) {
    await prisma.dSPDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: err?.message || 'Unknown DSP error',
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
      },
    });
    return { success: false, error: err?.message };
  }
}

// ── Rollback Delivery ─────────────────────────────────────────
export async function rollbackDelivery(releaseId: string): Promise<void> {
  await prisma.dSPDelivery.updateMany({
    where: { distributionReleaseId: releaseId, status: { in: ['submitted', 'live'] } },
    data: { status: 'rolled_back', rolledBackAt: new Date() },
  });
  await advanceReleaseStatus(releaseId, 'takedown', 'Delivery rolled back by artist/admin');
}

// ── Retry Failed Deliveries ───────────────────────────────────
export async function retryFailedDeliveries(releaseId: string): Promise<void> {
  const failed = await prisma.dSPDelivery.findMany({
    where: { distributionReleaseId: releaseId, status: 'failed' },
  });

  for (const delivery of failed) {
    if (delivery.retryCount >= 3) {
      console.warn(`[Distribution] Max retries reached for delivery ${delivery.id}`);
      continue;
    }
    await submitToDSP(delivery.id);
  }

  // Update parent retry count
  await prisma.distributionRelease.update({
    where: { id: releaseId },
    data: { retryCount: { increment: 1 }, lastRetryAt: new Date() },
  });
}
