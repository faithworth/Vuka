/**
 * VUKA — Moderation + Trust Engine (Phase 3)
 * Abuse reports, mod queues, DMCA, takedowns, fraud protections, verification
 */

import prisma from './prisma';
import { createNotification } from './social';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

// ── ABUSE REPORTS ─────────────────────────────────────────────

const VALID_CATEGORIES = [
  'harassment', 'hate_speech', 'spam', 'explicit_content',
  'impersonation', 'copyright', 'fraud', 'self_harm',
  'misinformation', 'other',
] as const;

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
  if (!data.reason?.trim()) throw new Error('Reason is required');

  // Anti-spam: limit report submissions
  if (data.reporterUserId) {
    await checkReportSpam(data.reporterUserId);
  }

  const report = await prisma.abuseReport.create({
    data: {
      reporterUserId: data.reporterUserId,
      reporterEmail: data.reporterEmail ?? '',
      targetType: data.targetType,
      targetId: data.targetId,
      targetTitle: data.targetTitle ?? '',
      reason: data.reason.trim(),
      category: data.category,
      description: data.description ?? '',
      evidence: data.evidence ?? [],
    },
  });

  return report;
}

async function checkReportSpam(userId: string) {
  const windowStart = new Date(Date.now() - 300_000); // 5-minute window
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

// ── MODERATION QUEUE ──────────────────────────────────────────

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
      orderBy: { createdAt: 'asc' }, // oldest first (FIFO queue)
      skip,
      take,
    }),
    prisma.abuseReport.count({ where }),
  ]);

  return { reports, total, hasMore: skip + reports.length < total };
}

/** Admin resolves a report and optionally takes action. */
export async function resolveAbuseReport(
  reportId: string,
  adminEmail: string,
  resolution: 'resolved_action' | 'resolved_noaction' | 'dismissed',
  actionTaken?: string,
  adminNotes?: string
): Promise<object> {
  const report = await prisma.abuseReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('Report not found');

  const updated = await prisma.abuseReport.update({
    where: { id: reportId },
    data: {
      status: resolution,
      actionTaken: actionTaken ?? '',
      adminNotes: adminNotes ?? '',
      assignedTo: adminEmail,
      resolvedAt: new Date(),
    },
  });

  // Log moderation action
  if (actionTaken) {
    await prisma.moderationAction.create({
      data: {
        adminEmail,
        targetType: (report as { targetType: string }).targetType,
        targetId: (report as { targetId: string }).targetId,
        action: actionTaken,
        reason: (report as { reason: string }).reason,
        notes: adminNotes ?? '',
      },
    });
  }

  // Apply content action
  if (actionTaken === 'content_removed' || actionTaken === 'hide_content') {
    await applyContentFlag(
      (report as { targetType: string }).targetType,
      (report as { targetId: string }).targetId,
      actionTaken === 'content_removed' ? 'removed' : 'hidden',
      (report as { reason: string }).reason,
      adminEmail
    );
  }

  if (actionTaken === 'account_suspended') {
    // Future: tie into Supabase auth ban
    await prisma.moderationAction.create({
      data: {
        adminEmail,
        targetType: 'user',
        targetId: (report as { reporterUserId?: string }).reporterUserId ?? '',
        action: 'suspend',
        reason: 'Abuse report resolution',
        notes: adminNotes ?? '',
      },
    });
  }

  return updated;
}

// ── CONTENT FLAGS ─────────────────────────────────────────────

export async function applyContentFlag(
  contentType: string,
  contentId: string,
  flagType: string,
  reason: string,
  flaggedBy: string
): Promise<void> {
  await prisma.contentFlag.upsert({
    where: { contentType_contentId_flagType: { contentType, contentId, flagType } },
    create: { contentType, contentId, flagType, reason, flaggedBy },
    update: { reason, flaggedBy },
  });

  // Apply the actual flag to content
  if (flagType === 'removed' || flagType === 'hidden') {
    if (contentType === 'beat') {
      await prisma.beat.update({ where: { id: contentId }, data: { isActive: false } });
    } else if (contentType === 'release') {
      await prisma.release.update({ where: { id: contentId }, data: { isActive: false } });
    } else if (contentType === 'post') {
      await prisma.artistPost.update({ where: { id: contentId }, data: { isPublished: false } });
    } else if (contentType === 'comment') {
      await prisma.postComment.update({ where: { id: contentId }, data: { isHidden: true } });
    }
  }
}

export async function removeContentFlag(contentType: string, contentId: string, flagType: string): Promise<void> {
  await prisma.contentFlag.deleteMany({ where: { contentType, contentId, flagType } });

  // Restore content
  if (flagType === 'removed' || flagType === 'hidden') {
    if (contentType === 'beat') {
      await prisma.beat.update({ where: { id: contentId }, data: { isActive: true } });
    } else if (contentType === 'release') {
      await prisma.release.update({ where: { id: contentId }, data: { isActive: true } });
    } else if (contentType === 'post') {
      await prisma.artistPost.update({ where: { id: contentId }, data: { isPublished: true } });
    } else if (contentType === 'comment') {
      await prisma.postComment.update({ where: { id: contentId }, data: { isHidden: false } });
    }
  }
}

// ── DMCA EXTENDED ─────────────────────────────────────────────

/** Extended DMCA processing with automatic takedown on confirmation. */
export async function processDMCAReport(
  reportId: string,
  adminEmail: string,
  action: 'investigating' | 'resolved' | 'dismissed',
  adminNotes?: string
): Promise<object> {
  const report = await prisma.dMCAReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('DMCA report not found');

  if (action === 'resolved') {
    // Takedown — deactivate the content
    const r = report as {
      itemType: string; itemId: string; artistId?: string;
      reporterEmail: string; reporterName: string; itemTitle: string;
    };
    await applyContentFlag(r.itemType, r.itemId, 'removed', 'DMCA takedown', adminEmail);

    // Notify artist if known
    if (r.artistId) {
      const artist = await prisma.artist.findUnique({
        where: { id: r.artistId },
        select: { userId: true, name: true },
      });
      if (artist) {
        await createNotification({
          userId: artist.userId,
          type: 'content_removed',
          title: 'Content removed — DMCA notice',
          body: `"${r.itemTitle}" was removed following a DMCA claim.`,
          actionUrl: '/dashboard',
        });
      }
    }

    await prisma.moderationAction.create({
      data: {
        adminEmail,
        targetType: r.itemType,
        targetId: r.itemId,
        action: 'remove_content',
        reason: 'DMCA takedown',
        notes: adminNotes ?? '',
      },
    });
  }

  return prisma.dMCAReport.update({
    where: { id: reportId },
    data: {
      status: action === 'resolved' ? 'resolved' : action,
      adminNotes: adminNotes ?? '',
      resolvedAt: action === 'resolved' ? new Date() : null,
    },
  });
}

// ── CREATOR VERIFICATION ──────────────────────────────────────

export async function submitVerificationRequest(
  artistId: string,
  data: {
    idDocumentUrl?: string;
    socialLinks?: Record<string, string>;
    monthlyListeners?: number;
    totalStreams?: number;
    notes?: string;
  }
): Promise<object> {
  // Check if already verified
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { isVerified: true } });
  if (artist?.isVerified) throw new Error('Artist is already verified');

  return prisma.verificationRequest.upsert({
    where: { artistId },
    create: {
      artistId,
      idDocumentUrl: data.idDocumentUrl ?? '',
      socialLinks: data.socialLinks ?? {},
      monthlyListeners: data.monthlyListeners ?? 0,
      totalStreams: data.totalStreams ?? 0,
      notes: data.notes ?? '',
      status: 'pending',
    },
    update: {
      idDocumentUrl: data.idDocumentUrl ?? '',
      socialLinks: data.socialLinks ?? {},
      monthlyListeners: data.monthlyListeners ?? 0,
      totalStreams: data.totalStreams ?? 0,
      notes: data.notes ?? '',
      status: 'pending',
    },
  });
}

export async function reviewVerificationRequest(
  requestId: string,
  adminEmail: string,
  decision: 'approved' | 'rejected',
  adminNotes?: string
): Promise<void> {
  const req = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error('Verification request not found');

  await prisma.verificationRequest.update({
    where: { id: requestId },
    data: {
      status: decision,
      adminNotes: adminNotes ?? '',
      reviewedBy: adminEmail,
      reviewedAt: new Date(),
    },
  });

  if (decision === 'approved') {
    await prisma.artist.update({
      where: { id: (req as { artistId: string }).artistId },
      data: { isVerified: true },
    });

    // Notify artist
    const artist = await prisma.artist.findUnique({
      where: { id: (req as { artistId: string }).artistId },
      select: { userId: true, name: true, slug: true },
    });
    if (artist) {
      await createNotification({
        userId: artist.userId,
        type: 'verification_approved',
        title: '✅ You\'re verified on Vuka!',
        body: 'Your verification badge is now live on your profile.',
        actionUrl: `/artist/${artist.slug}`,
      });
    }
  } else {
    const artist = await prisma.artist.findUnique({
      where: { id: (req as { artistId: string }).artistId },
      select: { userId: true },
    });
    if (artist) {
      await createNotification({
        userId: artist.userId,
        type: 'verification_rejected',
        title: 'Verification request reviewed',
        body: adminNotes ?? 'Your verification request was not approved at this time.',
        actionUrl: '/dashboard/settings',
      });
    }
  }

  await prisma.moderationAction.create({
    data: {
      adminEmail,
      targetType: 'artist',
      targetId: (req as { artistId: string }).artistId,
      action: decision === 'approved' ? 'verify' : 'unverify',
      notes: adminNotes ?? '',
    },
  });
}

// ── ADMIN MODERATION DASHBOARD ────────────────────────────────

export async function getModerationDashboard() {
  const [
    pendingReports, pendingDMCA, pendingVerifications,
    recentActions, flaggedContent,
  ] = await Promise.all([
    prisma.abuseReport.count({ where: { status: 'pending' } }),
    prisma.dMCAReport.count({ where: { status: 'pending' } }),
    prisma.verificationRequest.count({ where: { status: 'pending' } }),
    prisma.moderationAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.contentFlag.findMany({
      where: { flagType: { in: ['pending_review', 'adult', 'restricted'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    queues: { pendingReports, pendingDMCA, pendingVerifications },
    recentActions,
    flaggedContent,
  };
}
