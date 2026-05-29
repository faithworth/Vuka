/**
 * VUKA — Moderation + Trust Engine (Phase 4 — Hardened)
 *
 * Changes from Phase 3:
 *   - resolveAbuseReport: account_suspended action NOW wires Supabase Admin auth ban.
 *   - processDMCAReport: now writes audit log entry on takedown.
 *   - submitAbuseReport: validates attachment URLs are from own R2 bucket (anti-SSRF).
 *   - applyContentFlag: validates targetType whitelist (prevents injection).
 *   - Consistent error types and messages throughout.
 */

import prisma from './prisma';
import { createNotification } from './social';
import { auditLog } from './audit';
import { logger } from './logger';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const R2_PUBLIC_BASE = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '';

// ── ABUSE REPORTS ─────────────────────────────────────────────

const VALID_CATEGORIES = [
  'harassment', 'hate_speech', 'spam', 'explicit_content',
  'impersonation', 'copyright', 'fraud', 'self_harm',
  'misinformation', 'other',
] as const;

const VALID_TARGET_TYPES = ['beat', 'release', 'post', 'comment', 'artist', 'message'] as const;

function validateAttachmentUrl(url: string): boolean {
  if (!R2_PUBLIC_BASE) return true; // can't validate without base URL
  try {
    const parsed = new URL(url);
    const base   = new URL(R2_PUBLIC_BASE);
    return parsed.hostname === base.hostname;
  } catch {
    return false;
  }
}

export async function submitAbuseReport(data: {
  reporterUserId?: string;
  reporterEmail?: string;
  targetType: string;
  targetId: string;
  targetTitle?: string;
  reason: string;
  category: string;
  description?: string;
  evidence?: Array<{ url: string; description: string }>;
}): Promise<object> {
  if (!VALID_CATEGORIES.includes(data.category as typeof VALID_CATEGORIES[number])) {
    throw new Error(`Invalid category: ${data.category}`);
  }
  if (!VALID_TARGET_TYPES.includes(data.targetType as typeof VALID_TARGET_TYPES[number])) {
    throw new Error(`Invalid target type: ${data.targetType}`);
  }
  if (!data.reason?.trim()) throw new Error('Reason is required');
  if (data.reason.length > 2000) throw new Error('Reason exceeds 2000 characters');

  // Validate evidence attachment URLs are from own bucket (prevent SSRF)
  if (data.evidence && data.evidence.length > 0) {
    for (const ev of data.evidence) {
      if (!validateAttachmentUrl(ev.url)) {
        throw new Error('Evidence URLs must be from your own storage bucket');
      }
    }
  }

  if (data.reporterUserId) {
    await checkReportSpam(data.reporterUserId);
  }

  const report = await prisma.abuseReport.create({
    data: {
      reporterUserId: data.reporterUserId,
      reporterEmail:  data.reporterEmail ?? '',
      targetType:     data.targetType,
      targetId:       data.targetId,
      targetTitle:    data.targetTitle ?? '',
      reason:         data.reason.trim(),
      category:       data.category,
      description:    data.description ?? '',
      evidence:       data.evidence ?? [],
    },
  });

  return report;
}

async function checkReportSpam(userId: string): Promise<void> {
  const windowStart = new Date(Date.now() - 300_000);
  const MAX_PER_WINDOW = 5;

  const existing = await prisma.spamSignal.findFirst({
    where: { userId, action: 'report_submit', windowStart: { gte: windowStart } },
  });

  if (existing && (existing as { count: number }).count >= MAX_PER_WINDOW) {
    throw new Error('Too many reports submitted. Please wait before submitting more.');
  }

  if (existing) {
    await prisma.spamSignal.update({
      where: { id: existing.id },
      data: { count: { increment: 1 } },
    });
  } else {
    await prisma.spamSignal.create({
      data: { userId, action: 'report_submit', count: 1, windowStart },
    });
  }
}

// ── MODERATION QUEUE ─────────────────────────────────────────

export async function getModerationQueue(
  status = 'pending',
  category?: string,
  page = 1,
  limit = 30
): Promise<{ reports: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);
  const where = {
    status,
    ...(category ? { category } : {}),
  };
  const [reports, total] = await Promise.all([
    prisma.abuseReport.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    }),
    prisma.abuseReport.count({ where }),
  ]);
  return { reports, total, hasMore: skip + reports.length < total };
}

// ── REPORT RESOLUTION ────────────────────────────────────────

export async function resolveAbuseReport(
  reportId: string,
  adminId: string,
  decision: 'dismissed' | 'warned' | 'content_removed' | 'account_suspended',
  notes?: string
): Promise<void> {
  const report = await prisma.abuseReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('Report not found');
  if (report.status !== 'pending') throw new Error('Report already resolved');

  await prisma.abuseReport.update({
    where: { id: reportId },
    data: { status: 'resolved', adminNotes: notes ?? '', resolvedAt: new Date() },
  });

  await prisma.moderationAction.create({
    data: {
      reportId,
      adminId,
      adminEmail: adminId, // adminId is the admin's email in this context
      targetType: report.targetType,
      targetId:   report.targetId,
      action: decision,
      notes: notes ?? '',
    },
  });

  // Apply side effects per decision
  if (decision === 'content_removed') {
    await applyContentFlag(report.targetType, report.targetId, 'removed', adminId);
  }

  if (decision === 'account_suspended') {
    // Find the artist/user associated with the content
    const target = await resolveTargetOwner(report.targetType, report.targetId);
    if (target) {
      // 1. Ban in Supabase Auth
      await banSupabaseUser(target.supabaseUserId, '87600h', adminId); // 10-year effective permanent ban

      // 2. Audit log
      await auditLog.artistSuspended(target.artistId ?? target.userId, reportId, adminId);

      // 3. Notify the artist
      await createNotification({
        userId: target.userId,
        type: 'account_suspended',
        title: 'Account suspended',
        body: 'Your account has been suspended due to a policy violation. Contact support to appeal.',
        linkType: 'support',
        linkId: '',
      });
    }
  }

  await auditLog.securityEvent(
    'moderation.report_resolved',
    `reportId=${reportId} decision=${decision} admin=${adminId}`,
  );
}

async function resolveTargetOwner(
  targetType: string,
  targetId: string
): Promise<{ userId: string; artistId?: string; supabaseUserId: string } | null> {
  try {
    // Get the user via target entity
    if (targetType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: targetId },
        include: { artist: { include: { user: true } } },
      });
      if (beat) return { userId: beat.artist.userId, artistId: beat.artist.id, supabaseUserId: beat.artist.user.email };
    }
    if (targetType === 'release') {
      const release = await prisma.release.findUnique({
        where: { id: targetId },
        include: { artist: { include: { user: true } } },
      });
      if (release) return { userId: release.artist.userId, artistId: release.artist.id, supabaseUserId: release.artist.user.email };
    }
    if (targetType === 'post') {
      const post = await prisma.artistPost.findUnique({
        where: { id: targetId },
        include: { artist: { include: { user: true } } },
      });
      if (post) return { userId: post.artist.userId, artistId: post.artist.id, supabaseUserId: post.artist.user.email };
    }
    if (targetType === 'artist') {
      const artist = await prisma.artist.findUnique({
        where: { id: targetId },
        include: { user: true },
      });
      if (artist) return { userId: artist.userId, artistId: artist.id, supabaseUserId: artist.user.email };
    }
  } catch (err) {
    logger.error('[moderation] resolveTargetOwner failed', { targetType, targetId, error: String(err) });
  }
  return null;
}

/**
 * Ban a user in Supabase Auth.
 * Uses the Supabase Admin API — requires SUPABASE_SERVICE_ROLE_KEY.
 */
async function banSupabaseUser(
  userEmail: string,
  duration: string,
  adminId: string
): Promise<void> {
  try {
    const { createServiceClient } = await import('./superbase_server');
    const supabaseAdmin = await createServiceClient();

    // Look up Supabase user by email
    const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;

    const supabaseUser = userList.users.find((u) => u.email === userEmail);
    if (!supabaseUser) {
      logger.warn('[moderation] Supabase user not found for ban', { userEmail });
      return;
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
      ban_duration: duration,
    });

    if (error) throw error;

    logger.info('[moderation] Supabase user banned', { userEmail, duration, adminId });
  } catch (err) {
    logger.error('[moderation] Failed to ban Supabase user', {
      userEmail, adminId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error('Failed to ban user in auth system. Manual action required.');
  }
}

// ── CONTENT FLAGS ────────────────────────────────────────────

export async function applyContentFlag(
  targetType: string,
  targetId: string,
  flag: string,
  adminId: string,
  reason?: string
): Promise<void> {
  if (!VALID_TARGET_TYPES.includes(targetType as typeof VALID_TARGET_TYPES[number])) {
    throw new Error(`Invalid target type: ${targetType}`);
  }

  await prisma.contentFlag.upsert({
    where: { contentType_contentId_flagType: { contentType: targetType, contentId: targetId, flagType: flag } },
    create: { contentType: targetType, contentId: targetId, flagType: flag, adminId, reason: reason ?? '' },
    update: { updatedAt: new Date(), reason: reason ?? '', adminId },
  });

  // Deactivate the content live
  if (flag === 'removed' || flag === 'dmca') {
    await deactivateContent(targetType, targetId);
  }

  await auditLog.securityEvent(
    'moderation.content_flagged',
    `${targetType}=${targetId} flag=${flag} admin=${adminId}`,
  );
}

export async function removeContentFlag(
  targetType: string,
  targetId: string,
  flag: string,
  adminId: string
): Promise<void> {
  await prisma.contentFlag.deleteMany({ where: { contentType: targetType, contentId: targetId, flagType: flag } });
  await auditLog.securityEvent(
    'moderation.content_flag_removed',
    `${targetType}=${targetId} flag=${flag} admin=${adminId}`,
  );
}

async function deactivateContent(targetType: string, targetId: string): Promise<void> {
  try {
    if (targetType === 'beat') {
      await prisma.beat.update({ where: { id: targetId }, data: { isActive: false } });
    } else if (targetType === 'release') {
      await prisma.release.update({ where: { id: targetId }, data: { isActive: false } });
    } else if (targetType === 'post') {
      await prisma.artistPost.update({ where: { id: targetId }, data: { isPublished: false } });
    } else if (targetType === 'comment') {
      await prisma.postComment.update({
        where: { id: targetId },
        data: { isDeleted: true, body: '[removed by moderator]' },
      });
    }
  } catch (err) {
    logger.error('[moderation] deactivateContent failed', { targetType, targetId, error: String(err) });
  }
}

// ── DMCA ────────────────────────────────────────────────────

export async function processDMCAReport(
  reportId: string,
  adminId: string,
  resolution: 'takedown' | 'dismissed',
  adminNotes?: string
): Promise<void> {
  const report = await prisma.dmcaReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('DMCA report not found');

  await prisma.dmcaReport.update({
    where: { id: reportId },
    data: {
      status:     resolution === 'takedown' ? 'resolved' : 'dismissed',
      adminNotes: adminNotes ?? '',
      resolvedAt: new Date(),
    },
  });

  if (resolution === 'takedown') {
    // Deactivate the content
    await deactivateContent(report.itemType, report.itemId);
    await applyContentFlag(report.itemType, report.itemId, 'dmca', adminId, `DMCA report ${reportId}`);

    // Notify the artist
    if (report.artistId) {
      const artist = await prisma.artist.findUnique({
        where: { id: report.artistId },
        include: { user: true },
      });
      if (artist) {
        await createNotification({
          userId: artist.userId,
          type: 'dmca_takedown',
          title: 'Content removed — DMCA',
          body: `Your ${report.itemType} "${report.itemTitle}" has been removed following a DMCA claim.`,
          linkType: 'support',
          linkId: '',
        });
      }
    }

    await auditLog.dmcaTakedown(report.itemType, report.itemId, reportId, adminId);
  }
}

// ── CREATOR VERIFICATION ────────────────────────────────────

export async function submitVerification(
  artistId: string,
  data: {
    legalName: string;
    idDocumentUrl: string;
    socialProofUrl?: string;
    additionalInfo?: string;
  }
): Promise<object> {
  if (!data.legalName?.trim()) throw new Error('Legal name is required');
  if (!data.idDocumentUrl?.trim()) throw new Error('ID document is required');

  // Validate URL is from own bucket
  if (!validateAttachmentUrl(data.idDocumentUrl)) {
    throw new Error('ID document must be uploaded via Vuka file upload');
  }

  const request = await prisma.verificationRequest.upsert({
    where: { artistId },
    create: {
      artistId,
      legalName:      data.legalName.trim(),
      idDocumentUrl:  data.idDocumentUrl,
      socialProofUrl: data.socialProofUrl ?? '',
      additionalInfo: data.additionalInfo ?? '',
      status:         'pending',
    },
    update: {
      legalName:      data.legalName.trim(),
      idDocumentUrl:  data.idDocumentUrl,
      socialProofUrl: data.socialProofUrl ?? '',
      additionalInfo: data.additionalInfo ?? '',
      status:         'pending',
      updatedAt:      new Date(),
    },
  });

  return request;
}

export async function reviewVerification(
  requestId: string,
  adminId: string,
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<void> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new Error('Verification request not found');

  await prisma.verificationRequest.update({
    where: { id: requestId },
    data: { status: decision, adminNotes: notes ?? '', reviewedAt: new Date() },
  });

  if (decision === 'approved') {
    await prisma.artist.update({
      where: { id: request.artistId },
      data: { isVerified: true },
    });
    await auditLog.artistVerified(request.artistId, adminId);
  }

  // Notify artist
  const artist = await prisma.artist.findUnique({
    where: { id: request.artistId },
    select: { userId: true },
  });

  if (artist) {
    await createNotification({
      userId: artist.userId,
      type:   `verification_${decision}`,
      title:  decision === 'approved' ? '✅ Verified!' : 'Verification update',
      body:   decision === 'approved'
        ? 'Your artist account is now verified. Your profile shows the verified badge.'
        : `Your verification was not approved. ${notes ? `Reason: ${notes}` : 'Contact support for more info.'}`,
    });
  }
}

// ── ADMIN DASHBOARD ──────────────────────────────────────────

export async function getAdminDashboard(): Promise<object> {
  const [
    pendingReports,
    pendingDmca,
    pendingVerifications,
    recentActions,
    flaggedContent,
  ] = await Promise.all([
    prisma.abuseReport.count({ where: { status: 'pending' } }),
    prisma.dmcaReport.count({ where: { status: 'pending' } }),
    prisma.verificationRequest.count({ where: { status: 'pending' } }),
    prisma.moderationAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.contentFlag.findMany({
      where: { flagType: { in: ['removed', 'dmca', 'explicit'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    queue: { pendingReports, pendingDmca, pendingVerifications },
    recentActions,
    flaggedContent,
  };
}

// ── Aliases for route compatibility ──────────────────────────

export const getModerationDashboard = getAdminDashboard;
export const submitVerificationRequest = submitVerification;
export const reviewVerificationRequest = reviewVerification;
