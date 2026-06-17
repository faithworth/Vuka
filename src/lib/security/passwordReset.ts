/**
 * VUKA — Password Reset
 * Phase 10 Security
 *
 * Secure token generation, storage, validation, and consumption.
 * Uses $queryRaw / $executeRaw — see twoFactor.ts note.
 */

import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { createServiceClient } from '@/lib/supabase_server';

const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://vuka.co.za';

interface ResetTokenRow {
  id: string;
  userId: string;
  email: string;
  token: string;
  usedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
}

// ── Create a reset token ──────────────────────────────────────

export async function createPasswordResetToken(email: string): Promise<{
  ok: boolean;
  token?: string;
  userId?: string;
  name?: string;
}> {
  const users = await prisma.$queryRaw<UserRow[]>`
    SELECT id, email, name FROM users
    WHERE email = ${email.toLowerCase().trim()}
    LIMIT 1
  `;
  const user = users[0];
  // Always return ok=true — prevents email enumeration
  if (!user) return { ok: true };

  // Invalidate any previous unused tokens
  await prisma.$executeRaw`
    UPDATE password_reset_tokens
    SET "usedAt" = NOW()
    WHERE "userId" = ${user.id}
      AND "usedAt" IS NULL
      AND "expiresAt" > NOW()
  `;

  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MS);
  const id = crypto.randomUUID();

  await prisma.$executeRaw`
    INSERT INTO password_reset_tokens (id, "userId", email, token, "expiresAt", "createdAt")
    VALUES (${id}, ${user.id}, ${user.email}, ${token}, ${expiresAt}, NOW())
  `;

  return { ok: true, token, userId: user.id, name: user.name };
}

// ── Validate (without consuming) ─────────────────────────────

export async function validatePasswordResetToken(token: string): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
  error?: string;
}> {
  const rows = await prisma.$queryRaw<ResetTokenRow[]>`
    SELECT * FROM password_reset_tokens WHERE token = ${token} LIMIT 1
  `;
  const record = rows[0];
  if (!record) return { valid: false, error: 'Invalid or expired reset link.' };
  if (record.usedAt) return { valid: false, error: 'This reset link has already been used.' };
  if (record.expiresAt < new Date()) return { valid: false, error: 'This reset link has expired. Please request a new one.' };
  return { valid: true, userId: record.userId, email: record.email };
}

// ── Consume token and update password ────────────────────────

export async function consumePasswordResetToken(
  token: string,
  newPassword: string
): Promise<{ ok: boolean; userId?: string; email?: string; error?: string }> {
  const validation = await validatePasswordResetToken(token);
  if (!validation.valid) return { ok: false, error: validation.error };

  const supabase = await createServiceClient();

  // Find the Supabase auth user by email
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return { ok: false, error: 'Failed to process password reset.' };

  const sbUser = list?.users?.find(
    u => u.email?.toLowerCase() === validation.email?.toLowerCase()
  );
  if (!sbUser) return { ok: false, error: 'Account not found.' };

  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    sbUser.id,
    { password: newPassword }
  );
  if (updateErr) return { ok: false, error: updateErr.message ?? 'Failed to update password.' };

  // Mark token as used
  await prisma.$executeRaw`
    UPDATE password_reset_tokens SET "usedAt" = NOW() WHERE token = ${token}
  `;

  return { ok: true, userId: validation.userId, email: validation.email };
}

// ── URL helper ────────────────────────────────────────────────

export function getResetUrl(token: string): string {
  return `${APP_URL()}/auth/reset-password?token=${token}`;
}

// ── Cleanup ───────────────────────────────────────────────────

export async function cleanupExpiredResetTokens(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM password_reset_tokens
    WHERE "expiresAt" < NOW() - INTERVAL '24 hours'
  `;
}
