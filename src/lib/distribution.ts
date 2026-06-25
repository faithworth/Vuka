/**
 * VUKA — distribution.ts (Removed)
 *
 * Vuka is a direct-to-fan music SALES platform.
 * We do not distribute to DSPs (Spotify, Apple Music, etc.).
 * We do not issue ISRCs or UPCs.
 * Artists retain 100% of their rights — we only take a platform fee on sales.
 *
 * This file is kept as a named stub so any legacy import resolves without
 * a build crash. All active logic has moved to:
 *
 *   @/lib/releases.ts  — Release lifecycle, rights declaration, status transitions
 *
 * Do NOT add ISRC/UPC generation back here.
 * If an artist needs ISRC for external purposes they register with RISA directly.
 */

export {};

// ── Redirect imports that may still reference old symbols ──────────────────

// If you see a TS error referencing generateISRC or generateUPC anywhere,
// delete that import — those concepts don't exist in Vuka.
// For release status management, import from '@/lib/releases'.
