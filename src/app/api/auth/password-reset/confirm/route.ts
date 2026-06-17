/**
 * VUKA — Password Reset Confirm  (Phase 10)
 *
 * GET  /api/auth/password-reset/confirm?token=xxx  → validate token
 * POST /api/auth/password-reset/confirm             → set new password
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  validatePasswordResetToken,
  consumePasswordResetToken,
} from '@/lib/security/passwordReset';
import { revokeAllSessions } from '@/lib/security/deviceSessions';
import { sendPasswordChangedEmail } from '@/lib/emails';
import { auditLog } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import prisma from '@/lib/prisma';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://vuka.co.za';

// ── GET — validate token ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token required.' }, { status: 400 });
  }
  const result = await validatePasswordResetToken(token);
  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ valid: true, email: result.email });
}

// ── POST — set new password ───────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  const limited = await rateLimit(
    ip,
    { key: 'password_reset_confirm', max: 5, windowMs: 3_600_000 },
    ip
  );
  if (limited) {
    return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
  }

  let token = '';
  let password = '';
  try {
    const body = await req.json();
    if (typeof body.token === 'string') token = body.token;
    if (typeof body.password === 'string') password = body.password;
  } catch { /* ignore */ }

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  if (password.length > 128) {
    return NextResponse.json({ error: 'Password is too long.' }, { status: 400 });
  }

  const result = await consumePasswordResetToken(token, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Sign out all devices after password reset
  if (result.userId) {
    await revokeAllSessions(result.userId);

    const users = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM users WHERE id = ${result.userId} LIMIT 1
    `;

    sendPasswordChangedEmail({
      to: result.email!,
      displayName: users[0]?.name ?? 'there',
      securityUrl: `${APP_URL()}/settings/security`,
    }).catch(() => { /* non-blocking */ });

    auditLog.adminAction(
      'auth.password_reset', 'user', result.userId, result.userId,
      'Password reset via email link'
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Password updated. Please sign in with your new password.',
  });
}
