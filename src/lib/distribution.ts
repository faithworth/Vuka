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
