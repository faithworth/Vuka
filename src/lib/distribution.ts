// src/lib/distribution.ts
// Distribution infrastructure — ISRC/UPC generation, DSP delivery architecture.
// Import from here anywhere ISRC or UPC is needed.
// This is the REAL implementation used by the upload route.

// ── ISRC Generation ───────────────────────────────────────────
// Format: ZA-ZAV-YY-NNNNN
// ZA    = South Africa country code
// ZAV   = Vuka registrant code (register with RISA for production)
// YY    = 2-digit year
// NNNNN = 5-digit sequence (random for now; use DB sequence in production)

export function generateISRC(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const sequence = Math.floor(10000 + Math.random() * 90000); // 10000–99999
  return `ZA-ZAV-${year}-${sequence}`;
}

// ── UPC Generation ────────────────────────────────────────────
// 12-digit numeric with check digit (EAN-12 / UPC-A algorithm)
// Register with GS1 South Africa for a real company prefix in production.

export function generateUPC(): string {
  const prefix = '614'; // Placeholder — replace with your GS1 company prefix
  const random = Math.floor(Math.random() * 1_000_000_000)
    .toString()
    .padStart(9, '0');
  const digits = (prefix + random).slice(0, 11);

  // Calculate EAN-13 check digit (also valid as UPC-A)
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = parseInt(digits[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return digits + check;
}

// ── DSP Delivery Pipeline ─────────────────────────────────────
// Architecture for future DSP integrations.
// Each DSP adapter implements the DspAdapter interface.
// Currently only the internal Vuka distribution is live.

export interface DspDeliveryInput {
  releaseId: string;
  artistName: string;
  title: string;
  releaseType: 'single' | 'ep' | 'album';
  releaseDate: Date;
  upc: string;
  artworkUrl: string;
  tracks: {
    trackNumber: number;
    title: string;
    isrc: string;
    audioUrl: string;
    durationSeconds: number;
  }[];
}

export type DspStatus =
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'rejected';

export interface DspDeliveryResult {
  dsp: string;
  status: DspStatus;
  externalId?: string;
  error?: string;
}

interface DspAdapter {
  name: string;
  deliver(input: DspDeliveryInput): Promise<DspDeliveryResult>;
}

// Internal Vuka "distribution" (always succeeds — content is on our own platform)
class VukaInternalDsp implements DspAdapter {
  name = 'vuka';

  async deliver(input: DspDeliveryInput): Promise<DspDeliveryResult> {
    // Content is already stored in R2 — mark as delivered
    return { dsp: 'vuka', status: 'delivered', externalId: input.releaseId };
  }
}

// Placeholder adapters — replace with real API calls as integrations go live
class SpotifyDsp implements DspAdapter {
  name = 'spotify';
  async deliver(_input: DspDeliveryInput): Promise<DspDeliveryResult> {
    return { dsp: 'spotify', status: 'queued' };
  }
}

class AppleMusicDsp implements DspAdapter {
  name = 'apple_music';
  async deliver(_input: DspDeliveryInput): Promise<DspDeliveryResult> {
    return { dsp: 'apple_music', status: 'queued' };
  }
}

class AudiomackDsp implements DspAdapter {
  name = 'audiomack';
  async deliver(_input: DspDeliveryInput): Promise<DspDeliveryResult> {
    return { dsp: 'audiomack', status: 'queued' };
  }
}

// ── DistributionEngine ────────────────────────────────────────

const ADAPTERS: DspAdapter[] = [
  new VukaInternalDsp(),
  new SpotifyDsp(),
  new AppleMusicDsp(),
  new AudiomackDsp(),
];

export async function deliverToDsp(
  dspName: string,
  input: DspDeliveryInput
): Promise<DspDeliveryResult> {
  const adapter = ADAPTERS.find((a) => a.name === dspName);
  if (!adapter) {
    return { dsp: dspName, status: 'failed' as DspStatus, error: `Unknown DSP: ${dspName}` };
  }
  try {
    return await adapter.deliver(input);
  } catch (err: any) {
    return { dsp: dspName, status: 'failed' as DspStatus, error: err?.message ?? 'Unknown error' };
  }
}

export async function deliverToAllDsps(
  input: DspDeliveryInput
): Promise<DspDeliveryResult[]> {
  const results = await Promise.allSettled(
    ADAPTERS.map((adapter) => adapter.deliver(input))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      dsp: ADAPTERS[i].name,
      status: 'failed' as DspStatus,
      error: r.reason?.message ?? 'Unknown error',
    };
  });
}

// ── Missing exports required by distribution API routes ───────
// These were imported by admin/route.ts, submit/route.ts, and rollback/route.ts
// but never defined. Added here so the build resolves without moving any code.

import prisma from './prisma';

// All valid statuses for a DistributionRelease
export type DistributionStatus =
  | 'draft'
  | 'metadata_review'
  | 'artwork_review'
  | 'approved'
  | 'scheduled'
  | 'delivering'
  | 'submitted'
  | 'live'
  | 'failed'
  | 'rollback'
  | 'takedown';

// Append an entry to the statusHistory JSON array stored on DistributionRelease.
// Pure helper — does NOT write to DB. Returns the updated array.
export function appendStatusHistory(
  existing: Array<{ status: string; note: string; at: string }>,
  status: string,
  note: string
): Array<{ status: string; note: string; at: string }> {
  const safe = Array.isArray(existing) ? existing : [];
  return [...safe, { status, note, at: new Date().toISOString() }];
}

// Validate that a release has all required metadata before submission.
// Returns { valid, errors, warnings }.
export function validateReleaseMetadata(input: {
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
  copyrightHolder: string;
  copyrightYear?: number;
}): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.title?.trim()) errors.push('Release title is required.');
  if (!input.artistName?.trim()) errors.push('Artist name is required.');
  if (!input.primaryGenre?.trim()) errors.push('Primary genre is required.');
  if (!input.artworkUrl?.trim()) errors.push('Artwork is required.');
  // targetDSPs check removed — Vuka is the platform itself, no external DSP selection
  if (!input.copyrightHolder?.trim()) errors.push('Copyright holder is required.');
  if (!input.tracks?.length) errors.push('At least one track is required.');
  if (input.artworkStatus === 'rejected') errors.push('Artwork has been rejected — please upload a new image.');

  for (const track of input.tracks ?? []) {
    if (!track.title?.trim()) errors.push(`Track ${track.trackNumber}: title is required.`);
    if (!track.masterFileUrl?.trim()) errors.push(`Track ${track.trackNumber}: audio file is required.`);
    if (track.masterFileStatus === 'rejected') errors.push(`Track ${track.trackNumber}: audio was rejected — please re-upload.`);
    if (!track.isrc) warnings.push(`Track ${track.trackNumber}: no ISRC assigned — one will be auto-generated on approval.`);
  }

  if (!input.copyrightYear) warnings.push('No copyright year set — defaulting to current year on delivery.');

  return { valid: errors.length === 0, errors, warnings };
}

// Advance a DistributionRelease to a new status, appending to statusHistory.
export async function advanceReleaseStatus(
  releaseId: string,
  newStatus: DistributionStatus,
  note: string
): Promise<void> {
  const release = await prisma.distributionRelease.findUnique({
    where: { id: releaseId },
    select: { statusHistory: true },
  });
  if (!release) throw new Error(`Release ${releaseId} not found`);

  const history = appendStatusHistory(
    release.statusHistory as Array<{ status: string; note: string; at: string }>,
    newStatus,
    note
  );

  await prisma.distributionRelease.update({
    where: { id: releaseId },
    data: { status: newStatus, statusHistory: history },
  });
}

// Initiate delivery to all selected DSPs for an approved release.
// Creates DSPDelivery rows, fires adapters, updates release status.
export async function initiateDeliveryPipeline(releaseId: string): Promise<{
  success: boolean;
  errors: string[];
  deliveries: Array<{ dsp: string; status: string }>;
}> {
  const release = await prisma.distributionRelease.findUnique({
    where: { id: releaseId },
    include: { tracks: true, artist: { select: { name: true } } },
  });

  if (!release) return { success: false, errors: ['Release not found'], deliveries: [] };

  const dsps = release.targetDSPs?.length ? release.targetDSPs : ['vuka'];
  const errors: string[] = [];
  const deliveries: Array<{ dsp: string; status: string }> = [];

  // Update release status to delivering
  const history = appendStatusHistory(
    release.statusHistory as Array<{ status: string; note: string; at: string }>,
    'delivering',
    'Delivery pipeline initiated'
  );
  await prisma.distributionRelease.update({
    where: { id: releaseId },
    data: { status: 'delivering', statusHistory: history },
  });

  for (const dsp of dsps) {
    try {
      // Upsert a DSPDelivery record for this dsp
      const existing = await prisma.dSPDelivery.findFirst({
        where: { distributionReleaseId: releaseId, dsp },
      });

      let delivery;
      if (existing) {
        delivery = await prisma.dSPDelivery.update({
          where: { id: existing.id },
          data: { status: 'submitting', retryCount: { increment: 1 }, lastRetryAt: new Date() },
        });
      } else {
        delivery = await prisma.dSPDelivery.create({
          data: {
            distributionReleaseId: releaseId,
            dsp,
            status: 'submitting',
            deliveryPayload: {
              title: release.title,
              artistName: release.artistName || release.artist?.name,
              upc: release.upc,
              releaseType: release.releaseType,
              artworkUrl: release.artworkUrl,
              trackCount: release.tracks.length,
            },
          },
        });
      }

      // Run the DSP adapter
      const adapterInput: DspDeliveryInput = {
        releaseId,
        artistName: release.artistName || release.artist?.name || '',
        title: release.title,
        releaseType: release.releaseType as 'single' | 'ep' | 'album',
        releaseDate: release.scheduledDate || release.scheduledFor || new Date(),
        upc: release.upc || '',
        artworkUrl: release.artworkUrl,
        tracks: release.tracks.map((t) => ({
          trackNumber: t.trackNumber,
          title: t.title,
          isrc: t.isrc || '',
          audioUrl: t.masterFileUrl || t.fileUrl || '',
          durationSeconds: t.duration || 0,
        })),
      };

      const result = await deliverToAllDsps(adapterInput).then(
        (all) => all.find((r) => r.dsp === dsp) ?? { dsp, status: 'queued' as DspStatus, error: undefined }
      );

      // Mark delivery status
      const dspStatus = result.status === 'delivered' ? 'submitted' : result.status;
      await prisma.dSPDelivery.update({
        where: { id: delivery.id },
        data: {
          status: dspStatus,
          submittedAt: ['submitted', 'delivered'].includes(dspStatus) ? new Date() : undefined,
          errorMessage: (result as any).error ?? '',
        },
      });

      deliveries.push({ dsp, status: dspStatus });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${dsp}: ${msg}`);
      deliveries.push({ dsp, status: 'failed' });
      await prisma.dSPDelivery.updateMany({
        where: { distributionReleaseId: releaseId, dsp },
        data: { status: 'failed', errorMessage: msg, failedAt: new Date() },
      });
    }
  }

  // If any DSP succeeded, move release to submitted
  const anySuccess = deliveries.some((d) => d.status !== 'failed');
  if (anySuccess) {
    await advanceReleaseStatus(releaseId, 'submitted', 'Delivered to at least one DSP');
  }

  return { success: errors.length === 0, errors, deliveries };
}

// Retry all failed DSPDelivery rows for a release.
export async function retryFailedDeliveries(releaseId: string): Promise<void> {
  const failedDeliveries = await prisma.dSPDelivery.findMany({
    where: { distributionReleaseId: releaseId, status: 'failed' },
  });

  if (!failedDeliveries.length) return;

  // Reset them to queued so the next pipeline run picks them up
  await prisma.dSPDelivery.updateMany({
    where: { distributionReleaseId: releaseId, status: 'failed' },
    data: { status: 'queued', retryCount: { increment: 1 }, lastRetryAt: new Date() },
  });

  // Re-run the delivery pipeline — it will process all queued items
  await initiateDeliveryPipeline(releaseId);
}

// Initiate takedown/rollback — marks all DSP deliveries as rolled_back.
export async function rollbackDelivery(releaseId: string): Promise<void> {
  await prisma.dSPDelivery.updateMany({
    where: { distributionReleaseId: releaseId },
    data: { status: 'rolled_back', rolledBackAt: new Date() },
  });

  await advanceReleaseStatus(releaseId, 'takedown', 'Takedown initiated by artist');
}
