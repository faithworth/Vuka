/**
 * VUKA — Two-Factor Authentication (TOTP · RFC 6238)
 * Phase 10 Security — uses otplib v13 functional/sync API
 */

import { generateSecret, generateSync, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { encrypt, decrypt } from '@/lib/encryption';
import prisma from '@/lib/prisma';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Vuka Music';
const TOTP_OPTS = { digits: 6 as const, period: 30, window: 1 };

// ── Types ─────────────────────────────────────────────────────

interface TwoFactorRow {
  id: string;
  userId: string;
  secret: string;
  backupCodes: string;
  isEnabled: boolean;
  enabledAt: Date | null;
}

// ── Raw DB helpers ────────────────────────────────────────────

async function getTfaRow(userId: string): Promise<TwoFactorRow | null> {
  const rows = await prisma.$queryRaw<TwoFactorRow[]>`
    SELECT * FROM user_two_factor WHERE "userId" = ${userId} LIMIT 1
  `;
  return rows[0] ?? null;
}

// ── Core helpers ──────────────────────────────────────────────

export function generateTotpSecret(): string {
  return generateSecret({ length: 20 });
}

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase() + '-' +
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
}

export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    const result = verifySync({ token: token.replace(/\s/g, ''), secret, ...TOTP_OPTS });
    return typeof result === 'object' ? result.valid : Boolean(result);
  } catch { return false; }
}

export async function generateQrCode(email: string, secret: string): Promise<string> {
  const uri = generateURI({ secret, label: email, issuer: APP_NAME, strategy: 'totp', digits: TOTP_OPTS.digits, period: TOTP_OPTS.period });
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, color: { dark: '#000', light: '#fff' }, width: 256 });
}

// ── Setup ─────────────────────────────────────────────────────

export async function setup2FA(userId: string, email: string): Promise<{
  secret: string; qrCode: string; backupCodes: string[];
}> {
  const secret = generateTotpSecret();
  const backupCodes = generateBackupCodes(10);
  const qrCode = await generateQrCode(email, secret);
  const id = crypto.randomUUID();

  await prisma.$executeRaw`
    INSERT INTO user_two_factor
      (id,"userId",secret,"backupCodes","isEnabled","enabledAt","createdAt","updatedAt")
    VALUES
      (${id},${userId},${encrypt(secret)},${encrypt(JSON.stringify(backupCodes))},false,NULL,NOW(),NOW())
    ON CONFLICT ("userId") DO UPDATE SET
      secret=${encrypt(secret)},"backupCodes"=${encrypt(JSON.stringify(backupCodes))},
      "isEnabled"=false,"enabledAt"=NULL,"updatedAt"=NOW()
  `;
  return { secret, qrCode, backupCodes };
}

// ── Enable ────────────────────────────────────────────────────

export async function enable2FA(userId: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const row = await getTfaRow(userId);
  if (!row) return { ok: false, error: '2FA setup not started.' };
  let secret: string;
  try { secret = decrypt(row.secret); } catch { return { ok: false, error: 'Invalid 2FA configuration.' }; }
  if (!verifyTotpToken(token, secret)) return { ok: false, error: 'Invalid verification code.' };
  await prisma.$executeRaw`UPDATE user_two_factor SET "isEnabled"=true,"enabledAt"=NOW(),"updatedAt"=NOW() WHERE "userId"=${userId}`;
  return { ok: true };
}

// ── Disable ───────────────────────────────────────────────────

export async function disable2FA(userId: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const row = await getTfaRow(userId);
  if (!row?.isEnabled) return { ok: false, error: '2FA is not enabled.' };
  let secret: string;
  try { secret = decrypt(row.secret); } catch { return { ok: false, error: 'Invalid 2FA configuration.' }; }
  const validTotp = verifyTotpToken(token, secret);
  const validBackup = !validTotp && await _consumeBackupCode(userId, token, row);
  if (!validTotp && !validBackup) return { ok: false, error: 'Invalid code.' };
  await prisma.$executeRaw`UPDATE user_two_factor SET "isEnabled"=false,"enabledAt"=NULL,"updatedAt"=NOW() WHERE "userId"=${userId}`;
  return { ok: true };
}

// ── Verify during login ───────────────────────────────────────

export async function verify2FALogin(userId: string, token: string): Promise<{
  ok: boolean; usedBackupCode?: boolean; error?: string;
}> {
  const row = await getTfaRow(userId);
  if (!row?.isEnabled) return { ok: true };
  let secret: string;
  try { secret = decrypt(row.secret); } catch { return { ok: false, error: 'Invalid 2FA configuration.' }; }
  if (verifyTotpToken(token, secret)) return { ok: true, usedBackupCode: false };
  const usedBackup = await _consumeBackupCode(userId, token, row);
  if (usedBackup) return { ok: true, usedBackupCode: true };
  return { ok: false, error: 'Invalid authentication code.' };
}

// ── Backup code consumer ──────────────────────────────────────

async function _consumeBackupCode(userId: string, inputCode: string, row: TwoFactorRow): Promise<boolean> {
  let codes: string[];
  try { codes = JSON.parse(decrypt(row.backupCodes)); } catch { return false; }
  const needle = inputCode.toUpperCase().replace(/\s/g, '');
  const idx = codes.indexOf(needle);
  if (idx === -1) return false;
  const remaining = codes.filter((_, i) => i !== idx);
  await prisma.$executeRaw`UPDATE user_two_factor SET "backupCodes"=${encrypt(JSON.stringify(remaining))},"updatedAt"=NOW() WHERE "userId"=${userId}`;
  return true;
}

// ── Status & helpers ──────────────────────────────────────────

export async function get2FAStatus(userId: string): Promise<{
  isEnabled: boolean; enabledAt: Date | null; backupCodesRemaining: number;
}> {
  const row = await getTfaRow(userId);
  if (!row) return { isEnabled: false, enabledAt: null, backupCodesRemaining: 0 };
  let backupCodesRemaining = 0;
  try { backupCodesRemaining = JSON.parse(decrypt(row.backupCodes)).length; } catch {}
  return { isEnabled: row.isEnabled, enabledAt: row.enabledAt, backupCodesRemaining };
}

export async function user2FAEnabled(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ isEnabled: boolean }>>`
    SELECT "isEnabled" FROM user_two_factor WHERE "userId"=${userId} LIMIT 1
  `;
  return rows[0]?.isEnabled === true;
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const codes = generateBackupCodes(10);
  await prisma.$executeRaw`UPDATE user_two_factor SET "backupCodes"=${encrypt(JSON.stringify(codes))},"updatedAt"=NOW() WHERE "userId"=${userId}`;
  return codes;
}

// ── Challenge tokens ──────────────────────────────────────────

export async function create2FAChallenge(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.$executeRaw`
    INSERT INTO two_factor_challenges (id,"userId",token,"expiresAt","createdAt")
    VALUES (${crypto.randomUUID()},${userId},${token},${expiresAt},NOW())
  `;
  return token;
}

export async function consume2FAChallenge(token: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ userId: string; usedAt: Date | null; expiresAt: Date }>>`
    SELECT "userId","usedAt","expiresAt" FROM two_factor_challenges WHERE token=${token} LIMIT 1
  `;
  const ch = rows[0];
  if (!ch || ch.usedAt || ch.expiresAt < new Date()) return null;
  await prisma.$executeRaw`UPDATE two_factor_challenges SET "usedAt"=NOW() WHERE token=${token}`;
  return ch.userId;
}
