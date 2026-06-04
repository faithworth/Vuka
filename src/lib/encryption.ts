// ============================================================
// VUKA — AES-256-CBC Encryption Service (Phase 8 — hardened)
//
// Used ONLY for PII at rest: bank account numbers, branch codes.
// Decryption happens ONLY in payout workers — never returned to clients.
//
// ENCRYPTION_KEY = 64-char hex string (openssl rand -hex 32) → 32 bytes
// HMAC_KEY       = 64-char hex string (openssl rand -hex 32) → 32 bytes
//
// Ciphertext format: v1:<ivHex>:<encHex>:<hmacHex>
//   - Version prefix allows future algorithm migration
//   - HMAC-SHA256 over (iv + ciphertext) provides tamper detection
// ============================================================

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const ALGORITHM       = 'aes-256-cbc';
const CURRENT_VERSION = 'v1';

// ── Key helpers ───────────────────────────────────────────────

function getEncKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      '[encrypt] ENCRYPTION_KEY must be a 64-char hex string. ' +
      'Generate: openssl rand -hex 32'
    );
  }
  return Buffer.from(hex, 'hex');
}

function getHmacKey(): Buffer {
  const hex = process.env.HMAC_KEY;
  if (!hex || hex.length !== 64) {
    // Graceful fallback: derive from ENCRYPTION_KEY with a domain separator
    // so existing deployments without HMAC_KEY still work
    const enc = process.env.ENCRYPTION_KEY;
    if (!enc || enc.length !== 64) {
      throw new Error('[encrypt] HMAC_KEY (or ENCRYPTION_KEY fallback) is not set');
    }
    return createHmac('sha256', 'vuka-hmac-domain').update(enc).digest();
  }
  return Buffer.from(hex, 'hex');
}

function computeHmac(iv: Buffer, encrypted: Buffer): Buffer {
  return createHmac('sha256', getHmacKey())
    .update(iv)
    .update(encrypted)
    .digest();
}

// ── Core encrypt / decrypt ────────────────────────────────────

/**
 * Encrypt a plaintext string.
 * Returns versioned ciphertext: "v1:<ivHex>:<encHex>:<hmacHex>"
 */
export function encrypt(plaintext: string): string {
  const iv        = randomBytes(16);
  const cipher    = createCipheriv(ALGORITHM, getEncKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const hmac = computeHmac(iv, encrypted);
  return `${CURRENT_VERSION}:${iv.toString('hex')}:${encrypted.toString('hex')}:${hmac.toString('hex')}`;
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Throws on tamper detection, wrong key, or malformed input.
 */
export function decrypt(ciphertext: string): string {
  // Support legacy v0 format (no version prefix, no HMAC): "ivHex:encHex"
  if (!ciphertext.startsWith('v')) {
    return _decryptLegacy(ciphertext);
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('[decrypt] Invalid ciphertext format — expected "v1:ivHex:encHex:hmacHex"');
  }
  const [version, ivHex, encHex, hmacHex] = parts;

  if (version !== 'v1') {
    throw new Error(`[decrypt] Unsupported ciphertext version: ${version}`);
  }

  const iv        = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const storedHmac = Buffer.from(hmacHex, 'hex');

  // Constant-time comparison prevents timing attacks
  const expectedHmac = computeHmac(iv, encrypted);
  if (!timingSafeEqual(storedHmac, expectedHmac)) {
    throw new Error('[decrypt] HMAC verification failed — ciphertext tampered');
  }

  const decipher = createDecipheriv(ALGORITHM, getEncKey(), iv);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

/** Decrypt legacy format produced before Phase 8 (no version, no HMAC) */
function _decryptLegacy(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  if (!ivHex || !encHex) {
    throw new Error('[decrypt] Invalid legacy ciphertext format — expected "ivHex:encHex"');
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getEncKey(),
    Buffer.from(ivHex, 'hex')
  );
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ── Safe variants (never throw) ───────────────────────────────

/** Encrypts and returns null on failure (missing key, etc.) */
export function safeEncrypt(plaintext: string): string | null {
  try { return encrypt(plaintext); }
  catch { return null; }
}

/** Decrypts and returns null on failure. */
export function safeDecrypt(ciphertext: string): string | null {
  try { return decrypt(ciphertext); }
  catch { return null; }
}

// ── Re-encryption helper ──────────────────────────────────────

/**
 * Re-encrypt a ciphertext produced with the current key.
 * Used during key rotation: decrypt with OLD key, re-encrypt with NEW key.
 * The caller is responsible for swapping key env vars before calling.
 *
 * In practice, call this from an admin-triggered background job, never inline.
 */
export function reEncrypt(oldCiphertext: string, oldKey: string, oldHmacKey?: string): string {
  // Temporarily override keys for decryption
  const origEnc  = process.env.ENCRYPTION_KEY;
  const origHmac = process.env.HMAC_KEY;

  process.env.ENCRYPTION_KEY = oldKey;
  if (oldHmacKey) process.env.HMAC_KEY = oldHmacKey;

  let plaintext: string;
  try {
    plaintext = decrypt(oldCiphertext);
  } finally {
    // Always restore — even on error
    process.env.ENCRYPTION_KEY = origEnc;
    if (oldHmacKey) process.env.HMAC_KEY = origHmac;
  }

  return encrypt(plaintext);
}

// ── Mask helpers (never use for security — display only) ──────

/** Returns "****1234" style display string */
export function maskAccountNumber(raw: string): string {
  if (!raw || raw.length < 4) return '****';
  return `****${raw.slice(-4)}`;
}
