/**
 * VUKA — Admin Security Endpoints (Phase 8)
 *
 * GET  /api/admin/security         — security dashboard stats
 * POST /api/admin/security/reencrypt — trigger bank account re-encryption job
 *                                     (used after ENCRYPTION_KEY rotation)
 */

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { decrypt, encrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';

// ── GET — security dashboard ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Content flags query — used by admin security page
  const { searchParams } = new URL(req.url);
  if (searchParams.get('type') === 'flags') {
    try {
      const flags = await prisma.contentFlag.findMany({
        where: { status: { in: ['OPEN', 'open', 'UNDER_REVIEW'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }).catch(() => []);
      return NextResponse.json({ flags });
    } catch (err) {
      return NextResponse.json({ flags: [] });
    }
  }

  try {
    const [
      recentLogs,
      rateLimitHits,
      suspendedUsers,
      pendingPayouts,
      unverifiedBankAccounts,
      openFlags,
    ] = await Promise.all([
      // Last 50 security/admin audit log entries
      prisma.adminLog.findMany({
        where: { severity: { in: ['warn', 'critical'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }).catch(() => []),

      // Rate limit hits in last 24h
      prisma.spamSignal.count({
        where: {
          isFlagged: true,
          windowStart: { gte: new Date(Date.now() - 86_400_000) },
        },
      }).catch(() => 0),

      // Suspended user count
      prisma.user.count({ where: { isSuspended: true } }).catch(() => 0),

      // Pending payout requests
      prisma.payoutRequest.count({ where: { status: 'pending' } }).catch(() => 0),

      // Bank accounts not yet verified by admin
      prisma.artistBankAccount.count({ where: { isVerified: false } }).catch(() => 0),

      // Open content flags / DMCA
      prisma.contentFlag?.count({ where: { status: 'open' } }).catch(() => 0) ?? 0,
    ]);

    await auditLog.adminAction(
      'admin.stat_viewed',
      'security_dashboard',
      'dashboard',
      user.id,
      'Security dashboard viewed'
    );

    return NextResponse.json({
      stats: {
        rateLimitHits,
        suspendedUsers,
        pendingPayouts,
        unverifiedBankAccounts,
        openFlags,
      },
      recentLogs,
    });
  } catch (err) {
    logger.error('[admin/security] GET error', { error: err });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST /api/admin/security — dispatch sub-actions via ?action= ──────────

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action');

  // Also handle body-based actions (from admin security page)
  const body = await req.json().catch(() => ({}));
  const bodyAction = body.action || action;

  if (bodyAction === 'resolve' || bodyAction === 'dismiss') {
    const { flagId } = body;
    if (!flagId) return NextResponse.json({ error: 'flagId required' }, { status: 400 });
    try {
      await prisma.contentFlag.update({
        where: { id: flagId },
        data: {
          status: bodyAction === 'resolve' ? 'RESOLVED' : 'DISMISSED',
          reviewedBy: user.id,
          reviewedAt: new Date(),
        },
      }).catch(() => null);
      await auditLog.adminAction(`security.flag_${bodyAction}d`, 'ContentFlag', flagId, user.id, '');
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: 'Failed to update flag' }, { status: 500 });
    }
  }

  switch (action) {
    case 'reencrypt':
      return handleReEncrypt(req, user.id);
    case 'revoke-session':
      return handleRevokeSession(req, user.id);
    case 'flag-user':
      return handleFlagUser(req, user.id);
    default:
      return NextResponse.json({ error: `Unknown action: ${action || bodyAction}` }, { status: 400 });
  }
}

// ── Re-encryption job (key rotation) ─────────────────────────────────────

async function handleReEncrypt(req: NextRequest, adminId: string) {
  const body = await req.json().catch(() => ({}));
  const { oldKey, oldHmacKey, dryRun = true } = body as {
    oldKey?: string;
    oldHmacKey?: string;
    dryRun?: boolean;
  };

  if (!oldKey || oldKey.length !== 64) {
    return NextResponse.json(
      { error: 'oldKey must be a 64-character hex string (the previous ENCRYPTION_KEY)' },
      { status: 400 }
    );
  }

  const accounts = await prisma.artistBankAccount.findMany({
    select: { id: true, accountNumber: true, maskedNumber: true },
  });

  const results = {
    total: accounts.length,
    reencrypted: 0,
    skipped: 0,
    errors: [] as { id: string; reason: string }[],
  };

  for (const account of accounts) {
    if (!account.accountNumber || account.accountNumber === '') {
      results.skipped++;
      continue;
    }

    try {
      // Decrypt with old key
      const origEnc  = process.env.ENCRYPTION_KEY;
      const origHmac = process.env.HMAC_KEY;
      process.env.ENCRYPTION_KEY = oldKey;
      if (oldHmacKey) process.env.HMAC_KEY = oldHmacKey;
      let plaintext: string;
      try {
        plaintext = decrypt(account.accountNumber);
      } finally {
        process.env.ENCRYPTION_KEY = origEnc;
        process.env.HMAC_KEY = origHmac;
      }

      // Re-encrypt with current key (already restored above)
      const newCiphertext = encrypt(plaintext);

      if (!dryRun) {
        await prisma.artistBankAccount.update({
          where: { id: account.id },
          data: { accountNumber: newCiphertext },
        });
      }

      results.reencrypted++;
    } catch (err) {
      results.errors.push({
        id: account.id,
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  await auditLog.adminAction(
    'admin.key_rotation',
    'bank_accounts',
    'all',
    adminId,
    `Re-encryption ${dryRun ? 'DRY RUN' : 'LIVE'} — ${results.reencrypted}/${results.total} reencrypted, ${results.errors.length} errors`
  );

  return NextResponse.json({
    dryRun,
    results,
    message: dryRun
      ? 'Dry run complete. Set dryRun: false to apply changes.'
      : `Re-encryption complete. ${results.reencrypted} accounts updated.`,
  });
}

// ── Revoke a user session ─────────────────────────────────────────────────

async function handleRevokeSession(req: NextRequest, adminId: string) {
  const body = await req.json().catch(() => ({}));
  const { userId, reason } = body as { userId?: string; reason?: string };

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  // Supabase handles sessions — we mark the user for forced re-auth
  // by updating a forceLogout field if present, or logging the admin action.
  // The actual session invalidation is done via Supabase Admin API.
  await auditLog.adminAction(
    'auth.logout',
    'user',
    userId,
    adminId,
    reason ? `Forced session revoke: ${reason}` : 'Forced session revoke by admin'
  );

  return NextResponse.json({ ok: true, message: 'Session revoke logged. Use Supabase dashboard to invalidate tokens.' });
}

// ── Flag a user as suspicious ─────────────────────────────────────────────

async function handleFlagUser(req: NextRequest, adminId: string) {
  const body = await req.json().catch(() => ({}));
  const { userId, reason } = body as { userId?: string; reason?: string };

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  await prisma.spamSignal.create({
    data: {
      userId,
      action: 'admin_flag',
      count: 1,
      isFlagged: true,
      windowStart: new Date(),
    },
  });

  await auditLog.adminAction(
    'security.ip_blocked',
    'user',
    userId,
    adminId,
    reason ? `Flagged by admin: ${reason}` : 'Flagged by admin'
  );

  return NextResponse.json({ ok: true });
}

// ── Content flags GET ─────────────────────────────────────────────────────
// Called by /admin/security page as GET /api/admin/security?type=flags
// The existing GET handler returns security stats; extend it to also return flags
// by upgrading the route to handle the ?type query param (added below as a second path).
// The main GET still returns security stats; the page checks type=flags.
// This is handled by adding flag-query logic inside the existing GET export.
// See patched GET above — if ?type=flags is detected, return flags array.
