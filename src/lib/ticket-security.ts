// src/lib/ticket-security.ts
//
// Anti-fraud layer for event tickets. Two separate protections:
//
// 1. UNGUESSABLE TOKEN — qrToken is 24 bytes of crypto-strong randomness
//    (crypto.randomBytes, not Math.random or a timestamp). Nobody can
//    generate a token that happens to match a real ticket by guessing —
//    an image-generation tool like ChatGPT/DALL·E can draw something that
//    *looks* like a QR code, but the code it decodes to has to exist as a
//    real row in the database with status 'confirmed'. A fabricated QR
//    just decodes to a string that matches nothing, and the gate scan
//    rejects it as "not found".
//
// 2. SIGNED INTEGRITY — qrSignature is an HMAC of (purchaseId + qrToken)
//    using a server-only secret, computed once at issuance and stored on
//    the row. The gate check-in endpoint recomputes this signature from
//    the row's own stored id/token and compares it to what was stored at
//    issuance. This doesn't come from the client at all — its purpose is
//    to catch a ticket row that was created or edited outside the normal
//    paid/confirmed flow (e.g. a compromised admin session or direct DB
//    write handing out a "free" entry) rather than to validate anything
//    the scanner sends.
//
// Both checks run server-side, on every scan, against the live DB row —
// never trusting anything embedded in the QR image itself beyond the
// opaque token used to look the row up.

import crypto from 'crypto';

function getSecret(): string {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret) {
    // Fail loudly in production rather than silently using a guessable
    // fallback — a missing secret would make signatures worthless.
    throw new Error('TICKET_SIGNING_SECRET is not set — required for ticket gate security');
  }
  return secret;
}

/** Generates a cryptographically unguessable per-ticket token. */
export function generateQrToken(): string {
  return crypto.randomBytes(24).toString('base64url'); // 32 chars, URL-safe
}

/** Signs a (purchaseId, qrToken) pair at issuance time. */
export function signTicket(purchaseId: string, qrToken: string): string {
  return crypto.createHmac('sha256', getSecret()).update(`${purchaseId}.${qrToken}`).digest('hex');
}

/** Recomputes and checks the signature against what was stored at issuance. */
export function verifyTicketSignature(purchaseId: string, qrToken: string, storedSignature: string): boolean {
  const expected = signTicket(purchaseId, qrToken);
  // Constant-time compare — avoids leaking signature bytes via response timing.
  const a = Buffer.from(expected);
  const b = Buffer.from(storedSignature || '');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
