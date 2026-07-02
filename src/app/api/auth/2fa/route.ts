/**
 * VUKA — 2FA API  (Phase 10)
 *
 * GET  /api/auth/2fa                           → status
 * POST /api/auth/2fa?action=setup              → generate secret + QR
 * POST /api/auth/2fa?action=enable             → verify token, activate
 * POST /api/auth/2fa?action=disable            → deactivate with code
 * POST /api/auth/2fa?action=verify             → login challenge
 * POST /api/auth/2fa?action=regenerate-backup  → new backup codes
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import {
  setup2FA,
  enable2FA,
  disable2FA,
  verify2FALogin,
  get2FAStatus,
  create2FAChallenge,
  generateBackupCodes,
  regenerateBackupCodes,
  verifyTotpToken,
} from '@/lib/security/twoFactor';
import { decrypt } from '@/lib/encryption';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { auditLog } from '@/lib/audit';
import {
  send2FAEnabledEmail,
  send2FADisabledEmail,
} from '@/lib/emails';
import prisma from '@/lib/prisma';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://vukamusic.com';

// ── GET — status ──────────────────────────────────────────────

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = await get2FAStatus(user.id);
  return NextResponse.json(status);
}

// ── POST — dispatch by action ─────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action');
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  switch (action) {
    case 'setup':             return handleSetup(user, ip);
    case 'enable':            return handleEnable(user, body, ip);
    case 'disable':           return handleDisable(user, body, ip);
    case 'verify':            return handleVerify(user, body, ip);
    case 'regenerate-backup': return handleRegenBackup(user, body, ip);
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

// ── Setup ─────────────────────────────────────────────────────

async function handleSetup(
  user: { id: string; email: string },
  ip: string
) {
  const limited = await rateLimit(
    user.id,
    { key: 'twofa_setup', max: 5, windowMs: 3_600_000 },
    ip
  );
  if (limited) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const result = await setup2FA(user.id, user.email);
  return NextResponse.json(result);
}

// ── Enable ────────────────────────────────────────────────────

async function handleEnable(
  user: { id: string; email: string; name: string },
  body: Record<string, unknown>,
  ip: string
) {
  const limited = await rateLimit(
    user.id,
    { key: 'twofa_verify', max: 10, windowMs: 900_000 },
    ip
  );
  if (limited) return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return NextResponse.json({ error: 'Verification code required.' }, { status: 400 });

  const result = await enable2FA(user.id, token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  auditLog.adminAction('auth.2fa_enabled', 'user', user.id, user.id, '2FA enabled');
  send2FAEnabledEmail({
    to: user.email,
    displayName: user.name,
    securityUrl: `${APP_URL()}/settings/security`,
  }).catch(() => { /* non-blocking */ });

  return NextResponse.json({ ok: true });
}

// ── Disable ───────────────────────────────────────────────────

async function handleDisable(
  user: { id: string; email: string; name: string },
  body: Record<string, unknown>,
  ip: string
) {
  const limited = await rateLimit(
    user.id,
    { key: 'twofa_disable', max: 5, windowMs: 900_000 },
    ip
  );
  if (limited) return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return NextResponse.json({ error: 'Verification code required.' }, { status: 400 });

  const result = await disable2FA(user.id, token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  auditLog.adminAction('auth.2fa_disabled', 'user', user.id, user.id, '2FA disabled');
  send2FADisabledEmail({
    to: user.email,
    displayName: user.name,
    securityUrl: `${APP_URL()}/settings/security`,
  }).catch(() => { /* non-blocking */ });

  return NextResponse.json({ ok: true });
}

// ── Verify (login challenge) ──────────────────────────────────

async function handleVerify(
  user: { id: string },
  body: Record<string, unknown>,
  ip: string
) {
  const limited = await rateLimit(
    user.id,
    { key: 'twofa_login', max: 10, windowMs: 600_000 },
    ip
  );
  if (limited) return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return NextResponse.json({ error: 'Code required.' }, { status: 400 });

  const result = await verify2FALogin(user.id, token);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Invalid code.' }, { status: 400 });

  const challengeToken = await create2FAChallenge(user.id);
  return NextResponse.json({
    ok: true,
    usedBackupCode: result.usedBackupCode ?? false,
    challengeToken,
  });
}

// ── Regenerate backup codes ───────────────────────────────────

async function handleRegenBackup(
  user: { id: string },
  body: Record<string, unknown>,
  ip: string
) {
  const limited = await rateLimit(
    user.id,
    { key: 'twofa_backup_regen', max: 3, windowMs: 3_600_000 },
    ip
  );
  if (limited) return NextResponse.json({ error: 'Too many attempts.' }, { status: 429 });

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) {
    return NextResponse.json(
      { error: 'Current 2FA code required to regenerate backup codes.' },
      { status: 400 }
    );
  }

  // Verify the current TOTP before regenerating
  const rows = await prisma.$queryRaw<Array<{ secret: string }>>`
    SELECT secret FROM user_two_factor
    WHERE "userId" = ${user.id} AND "isEnabled" = true
    LIMIT 1
  `;
  if (!rows[0]) {
    return NextResponse.json({ error: '2FA is not enabled.' }, { status: 400 });
  }

  let secret: string;
  try { secret = decrypt(rows[0].secret); }
  catch { return NextResponse.json({ error: 'Invalid 2FA configuration.' }, { status: 500 }); }

  if (!(await verifyTotpToken(token, secret))) {
    return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
  }

  const codes = await regenerateBackupCodes(user.id);
  auditLog.adminAction(
    'auth.2fa_backup_regenerated', 'user', user.id, user.id, 'Backup codes regenerated'
  );
  return NextResponse.json({ ok: true, backupCodes: codes });
}
