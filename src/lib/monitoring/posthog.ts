/**
 * VUKA — PostHog Analytics Integration
 * Phase 11 — Infrastructure & Deployment
 *
 * Server-side event tracking for product analytics.
 * All events are anonymous by default (no PII sent to PostHog).
 * Artist IDs are pseudonymised as hashed IDs before sending.
 */

import { createHash } from 'crypto';

const POSTHOG_KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';

// Pseudonymise user IDs before sending to PostHog
function pseudoId(userId: string): string {
  return createHash('sha256').update(`vuka:${userId}`).digest('hex').slice(0, 16);
}

interface PostHogEvent {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}

/**
 * Fire-and-forget server-side PostHog event capture.
 * Uses the PostHog HTTP API directly (no SDK required on server).
 */
export async function captureEvent(
  event: string,
  userId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!POSTHOG_KEY) return; // analytics disabled

  const payload: PostHogEvent = {
    event,
    distinctId: pseudoId(userId),
    properties: {
      $lib: 'vuka-server',
      ...properties,
    },
  };

  // Fire-and-forget — never block the request path
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      ...payload,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // Silently swallow analytics failures — never crash the app
  });
}

// ── Typed event helpers ─────────────────────────────────────

export const Analytics = {
  releaseSubmitted: (userId: string, releaseId: string, releaseType: string) =>
    captureEvent('release_submitted', userId, { releaseId, releaseType }),

  releaseApproved: (userId: string, releaseId: string) =>
    captureEvent('release_approved', userId, { releaseId }),

  releaseRejected: (userId: string, releaseId: string, reason: string) =>
    captureEvent('release_rejected', userId, { releaseId, reason }),

  releaseLive: (userId: string, releaseId: string, platformCount: number) =>
    captureEvent('release_live', userId, { releaseId, platformCount }),

  payoutRequested: (userId: string, amountZAR: number, method: string) =>
    captureEvent('payout_requested', userId, { amountZAR, method }),

  payoutCompleted: (userId: string, amountZAR: number) =>
    captureEvent('payout_completed', userId, { amountZAR }),

  userRegistered: (userId: string, country: string, role: string) =>
    captureEvent('user_registered', userId, { country, role }),

  subscriptionUpgraded: (userId: string, fromPlan: string, toPlan: string) =>
    captureEvent('subscription_upgraded', userId, { fromPlan, toPlan }),

  beatPurchased: (buyerId: string, beatId: string, licenseType: string, amountZAR: number) =>
    captureEvent('beat_purchased', buyerId, { beatId, licenseType, amountZAR }),
};
