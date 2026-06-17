/**
 * VUKA — Device Sessions API  (Phase 10)
 *
 * GET  /api/auth/devices                      → list active sessions
 * POST /api/auth/devices?action=register      → register current device
 * POST /api/auth/devices?action=revoke        → sign out one device
 * POST /api/auth/devices?action=revoke-all    → sign out all others
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import {
  getUserSessions,
  revokeSession,
  revokeAllOtherSessions,
  registerDeviceSession,
  getIpFromHeaders,
  generateSessionToken,
  cleanupOldSessions,
} from '@/lib/security/deviceSessions';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { auditLog } from '@/lib/audit';
import {
  sendSessionRevokedEmail,
  sendAllSessionsRevokedEmail,
} from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://vuka.co.za';

// ── GET — list sessions ───────────────────────────────────────

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessions = await getUserSessions(user.id);
  return NextResponse.json({ sessions });
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
    case 'register':   return handleRegister(user, body, req.headers);
    case 'revoke':     return handleRevoke(user, body, ip);
    case 'revoke-all': return handleRevokeAll(user, body, ip);
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

// ── Register current device ───────────────────────────────────

async function handleRegister(
  user: { id: string },
  body: Record<string, unknown>,
  headers: Headers
) {
  const userAgent = headers.get('user-agent') ?? '';
  const ipAddress = getIpFromHeaders(headers);
  const sessionId =
    typeof body.sessionId === 'string' ? body.sessionId : generateSessionToken();

  await registerDeviceSession({
    userId: user.id,
    sessionId,
    userAgent,
    ipAddress,
    isCurrent: true,
  });

  return NextResponse.json({ ok: true, sessionId });
}

// ── Revoke one session ────────────────────────────────────────

async function handleRevoke(
  user: { id: string; email: string; name: string },
  body: Record<string, unknown>,
  ip: string
) {
  const limited = await rateLimit(
    user.id,
    { key: 'device_revoke', max: 20, windowMs: 3_600_000 },
    ip
  );
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });

  // Get device name before revoking (for email)
  const sessions = await getUserSessions(user.id);
  const target = sessions.find(s => s.id === sessionId);

  const ok = await revokeSession(user.id, sessionId);
  if (!ok) {
    return NextResponse.json(
      { error: 'Session not found or cannot be revoked.' },
      { status: 404 }
    );
  }

  auditLog.adminAction(
    'auth.session_revoked', 'user', user.id, user.id,
    `Revoked: ${target?.deviceName ?? 'unknown'}`
  );

  if (target) {
    sendSessionRevokedEmail({
      to: user.email,
      displayName: user.name,
      deviceName: target.deviceName,
      securityUrl: `${APP_URL()}/settings/security`,
    }).catch(() => { /* non-blocking */ });
  }

  cleanupOldSessions(user.id).catch(() => { /* non-blocking */ });
  return NextResponse.json({ ok: true });
}

// ── Revoke all other sessions ─────────────────────────────────

async function handleRevokeAll(
  user: { id: string; email: string; name: string },
  body: Record<string, unknown>,
  ip: string
) {
  const limited = await rateLimit(
    user.id,
    { key: 'device_revoke_all', max: 5, windowMs: 3_600_000 },
    ip
  );
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const currentSessionId =
    typeof body.currentSessionId === 'string' ? body.currentSessionId : undefined;

  const count = await revokeAllOtherSessions(user.id, currentSessionId);

  auditLog.adminAction(
    'auth.all_sessions_revoked', 'user', user.id, user.id,
    `${count} sessions revoked`
  );

  if (count > 0) {
    sendAllSessionsRevokedEmail({
      to: user.email,
      displayName: user.name,
      securityUrl: `${APP_URL()}/settings/security`,
    }).catch(() => { /* non-blocking */ });
  }

  cleanupOldSessions(user.id).catch(() => { /* non-blocking */ });

  return NextResponse.json({
    ok: true,
    count,
    message: count > 0
      ? `Signed out ${count} other device${count !== 1 ? 's' : ''}.`
      : 'No other sessions to sign out.',
  });
}
