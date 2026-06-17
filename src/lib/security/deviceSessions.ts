/**
 * VUKA — Device Session Management
 * Phase 10 Security
 *
 * Tracks every login with device/browser/OS/IP info.
 * Uses $queryRaw / $executeRaw — see twoFactor.ts note.
 */

import { UAParser } from 'ua-parser-js';
import crypto from 'crypto';
import prisma from '@/lib/prisma';

// ── Types ─────────────────────────────────────────────────────

export interface DeviceInfo {
  deviceName: string;
  browser: string;
  os: string;
}

export interface SessionRecord {
  id: string;
  sessionId: string;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  isCurrent: boolean;
  lastSeenAt: Date;
  createdAt: Date;
}

interface RawSession {
  id: string;
  sessionId: string;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  isCurrent: boolean;
  isRevoked: boolean;
  revokedAt: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
}

// ── UA parsing ────────────────────────────────────────────────

export function parseUserAgent(ua: string): DeviceInfo {
  if (!ua) return { deviceName: 'Unknown Device', browser: 'Unknown', os: 'Unknown' };

  const p = new UAParser(ua).getResult();

  const browser = p.browser.name
    ? `${p.browser.name}${p.browser.version ? ` ${p.browser.version.split('.')[0]}` : ''}`
    : 'Unknown Browser';

  const os = p.os.name
    ? `${p.os.name}${p.os.version ? ` ${p.os.version}` : ''}`
    : 'Unknown OS';

  const type = p.device.type;
  const model = p.device.model;

  let deviceName: string;
  if (model) deviceName = model;
  else if (type === 'mobile') deviceName = 'Mobile Device';
  else if (type === 'tablet') deviceName = 'Tablet';
  else deviceName = `${os} — ${browser}`;

  return { deviceName, browser, os };
}

export function getIpFromHeaders(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}

export function generateSessionToken(): string {
  return `vks_${crypto.randomBytes(24).toString('base64url')}`;
}

// ── Mask IP for display ───────────────────────────────────────

function maskIp(ip: string): string {
  if (!ip || ip === 'unknown') return 'Unknown';
  const v4 = ip.split('.');
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.*.*`;
  const v6 = ip.split(':');
  if (v6.length > 2) return `${v6[0]}:${v6[1]}::*`;
  return ip;
}

// ── Register / refresh session ────────────────────────────────

export async function registerDeviceSession(params: {
  userId: string;
  sessionId: string;
  userAgent: string;
  ipAddress: string;
  isCurrent?: boolean;
}): Promise<void> {
  const { userId, sessionId, userAgent, ipAddress, isCurrent = false } = params;
  const { deviceName, browser, os } = parseUserAgent(userAgent);
  const id = crypto.randomUUID();

  if (isCurrent) {
    // Clear previous current marker
    await prisma.$executeRaw`
      UPDATE user_device_sessions SET "isCurrent" = false WHERE "userId" = ${userId}
    `;
  }

  await prisma.$executeRaw`
    INSERT INTO user_device_sessions
      (id, "userId", "sessionId", "deviceName", browser, os, "ipAddress",
       "isCurrent", "isRevoked", "lastSeenAt", "createdAt")
    VALUES
      (${id}, ${userId}, ${sessionId}, ${deviceName}, ${browser}, ${os},
       ${ipAddress}, ${isCurrent}, false, NOW(), NOW())
    ON CONFLICT ("sessionId") DO UPDATE SET
      "lastSeenAt" = NOW(),
      "ipAddress"  = EXCLUDED."ipAddress",
      "isCurrent"  = EXCLUDED."isCurrent",
      "isRevoked"  = false
  `;
}

// ── Read active sessions ──────────────────────────────────────

export async function getUserSessions(userId: string): Promise<SessionRecord[]> {
  const rows = await prisma.$queryRaw<RawSession[]>`
    SELECT id, "sessionId", "deviceName", browser, os, "ipAddress",
           "isCurrent", "lastSeenAt", "createdAt"
    FROM user_device_sessions
    WHERE "userId" = ${userId} AND "isRevoked" = false
    ORDER BY "isCurrent" DESC, "lastSeenAt" DESC
  `;
  return rows.map(r => ({ ...r, ipAddress: maskIp(r.ipAddress) }));
}

// ── Revoke one session (not current) ─────────────────────────

export async function revokeSession(userId: string, sessionDbId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string; isCurrent: boolean }>>`
    SELECT id, "isCurrent" FROM user_device_sessions
    WHERE id = ${sessionDbId} AND "userId" = ${userId} AND "isRevoked" = false
    LIMIT 1
  `;
  const s = rows[0];
  if (!s) return false;
  if (s.isCurrent) return false; // can't revoke own current session via this path

  await prisma.$executeRaw`
    UPDATE user_device_sessions
    SET "isRevoked" = true, "revokedAt" = NOW()
    WHERE id = ${sessionDbId}
  `;
  return true;
}

// ── Revoke all OTHER sessions (keep current) ─────────────────

export async function revokeAllOtherSessions(
  userId: string,
  currentSessionId?: string
): Promise<number> {
  let result: number | bigint;

  if (currentSessionId) {
    result = await prisma.$executeRaw`
      UPDATE user_device_sessions
      SET "isRevoked" = true, "revokedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "isRevoked" = false
        AND "sessionId" != ${currentSessionId}
    `;
  } else {
    result = await prisma.$executeRaw`
      UPDATE user_device_sessions
      SET "isRevoked" = true, "revokedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "isRevoked" = false
        AND "isCurrent" = false
    `;
  }

  return typeof result === 'bigint' ? Number(result) : (result ?? 0);
}

// ── Revoke ALL sessions (password change / admin force) ───────

export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE user_device_sessions
    SET "isRevoked" = true, "revokedAt" = NOW(), "isCurrent" = false
    WHERE "userId" = ${userId} AND "isRevoked" = false
  `;
  return typeof result === 'bigint' ? Number(result) : (result ?? 0);
}

// ── Housekeeping ──────────────────────────────────────────────

export async function cleanupOldSessions(userId: string): Promise<void> {
  // Keep max 30 revoked entries per user — delete oldest beyond that
  await prisma.$executeRaw`
    DELETE FROM user_device_sessions
    WHERE "userId" = ${userId}
      AND "isRevoked" = true
      AND id NOT IN (
        SELECT id FROM user_device_sessions
        WHERE "userId" = ${userId} AND "isRevoked" = true
        ORDER BY "revokedAt" DESC NULLS LAST
        LIMIT 30
      )
  `;
}
