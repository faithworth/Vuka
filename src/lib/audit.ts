/**
 * VUKA — Audit Log Service
 *
 * Immutable, append-only audit trail for all security and business-critical
 * operations. Writes to the AdminLog table synchronously so no event is lost.
 *
 * Log categories:
 *   auth.*       — login, logout, role change, ban
 *   payment.*    — purchase confirmed, payout processed, refund issued
 *   content.*    — upload, delete, deactivate, DMCA takedown
 *   moderation.* — report resolved, content flagged, artist suspended
 *   admin.*      — admin action taken
 *   security.*   — rate limit hit, signature failure, suspicious activity
 */

import prisma from './prisma';
import { logger } from './logger';

export type AuditCategory =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.role_change'
  | 'auth.ban'
  | 'auth.unban'
  | 'payment.purchase_confirmed'
  | 'payment.payout_processed'
  | 'payment.refund_issued'
  | 'payment.payout_failed'
  | 'content.beat_uploaded'
  | 'content.release_uploaded'
  | 'content.beat_deleted'
  | 'content.release_deleted'
  | 'content.beat_deactivated'
  | 'content.dmca_takedown'
  | 'content.exclusive_locked'
  | 'moderation.report_resolved'
  | 'moderation.content_flagged'
  | 'moderation.content_flag_removed'
  | 'moderation.artist_suspended'
  | 'moderation.artist_verified'
  | 'moderation.verification_rejected'
  | 'admin.stat_viewed'
  | 'admin.queue_viewed'
  | 'security.rate_limit_hit'
  | 'security.signature_failure'
  | 'security.ip_blocked'
  | 'security.invalid_download_attempt';

export interface AuditPayload {
  action: AuditCategory;
  targetType?: string;
  targetId?: string;
  actorId?: string;       // userId performing the action
  actorEmail?: string;
  ipAddress?: string;
  notes?: string;
  meta?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Never throws — failures are logged to stderr
 * but must not break the calling request.
 */
export async function audit(payload: AuditPayload): Promise<void> {
  try {
    const notes = [
      payload.notes ?? '',
      payload.actorId   ? `actorId=${payload.actorId}` : '',
      payload.actorEmail ? `actor=${payload.actorEmail}` : '',
      payload.ipAddress  ? `ip=${payload.ipAddress}` : '',
      payload.meta       ? `meta=${JSON.stringify(payload.meta)}` : '',
    ].filter(Boolean).join(' | ');

    await prisma.adminLog.create({
      data: {
        action:     payload.action,
        targetType: payload.targetType ?? '',
        targetId:   payload.targetId   ?? '',
        notes,
      },
    });
  } catch (err) {
    // Audit failures must never break the application — log and continue
    logger.error('[audit] Failed to write audit log', {
      action: payload.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Convenience wrappers for the most common audit events.
 */
export const auditLog = {
  purchaseConfirmed(purchaseId: string, itemName: string, amount: number, currency: string, buyerEmail: string) {
    return audit({
      action: 'payment.purchase_confirmed',
      targetType: 'purchase',
      targetId: purchaseId,
      actorEmail: buyerEmail,
      notes: `${itemName} — ${currency} ${amount.toFixed(2)}`,
    });
  },

  exclusiveLocked(beatId: string, beatTitle: string, purchaseId: string) {
    return audit({
      action: 'content.exclusive_locked',
      targetType: 'beat',
      targetId: beatId,
      notes: `Beat "${beatTitle}" locked exclusive. purchaseId=${purchaseId}`,
    });
  },

  dmcaTakedown(itemType: string, itemId: string, reportId: string, adminId?: string) {
    return audit({
      action: 'content.dmca_takedown',
      targetType: itemType,
      targetId: itemId,
      actorId: adminId,
      notes: `DMCA takedown. reportId=${reportId}`,
    });
  },

  artistSuspended(artistId: string, reportId: string, adminId: string) {
    return audit({
      action: 'moderation.artist_suspended',
      targetType: 'artist',
      targetId: artistId,
      actorId: adminId,
      notes: `Suspended via reportId=${reportId}`,
    });
  },

  artistVerified(artistId: string, adminId: string) {
    return audit({
      action: 'moderation.artist_verified',
      targetType: 'artist',
      targetId: artistId,
      actorId: adminId,
    });
  },

  securityEvent(type: AuditCategory, details: string, ipAddress?: string) {
    return audit({
      action: type,
      ipAddress,
      notes: details,
    });
  },
};
