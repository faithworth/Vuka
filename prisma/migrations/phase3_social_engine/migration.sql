-- ============================================================
-- VUKA Phase 3 Migration
-- Social Engine + Discovery + Messaging + Analytics + Moderation
-- All statements use IF NOT EXISTS for idempotency.
-- Run: npx prisma migrate dev --name phase3_social_engine
-- ============================================================

-- ── SOCIAL ENGINE ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EngagementEvent" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT NOT NULL,
  "repostNote"  TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngagementEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngagementEvent_unique" UNIQUE ("userId", "type", "targetType", "targetId")
);
CREATE INDEX IF NOT EXISTS "EngagementEvent_userId_idx" ON "EngagementEvent"("userId");
CREATE INDEX IF NOT EXISTS "EngagementEvent_target_idx" ON "EngagementEvent"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "EngagementEvent_type_idx" ON "EngagementEvent"("type", "targetType");
CREATE INDEX IF NOT EXISTS "EngagementEvent_createdAt_idx" ON "EngagementEvent"("createdAt");

CREATE TABLE IF NOT EXISTS "ArtistPost" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"     TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "mediaUrls"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "linkUrl"      TEXT NOT NULL DEFAULT '',
  "linkType"     TEXT NOT NULL DEFAULT '',
  "linkItemId"   TEXT NOT NULL DEFAULT '',
  "likeCount"    INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "repostCount"  INTEGER NOT NULL DEFAULT 0,
  "isPinned"     BOOLEAN NOT NULL DEFAULT false,
  "isPublished"  BOOLEAN NOT NULL DEFAULT true,
  "publishedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtistPost_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ArtistPost_artistId_idx" ON "ArtistPost"("artistId");
CREATE INDEX IF NOT EXISTS "ArtistPost_publishedAt_idx" ON "ArtistPost"("publishedAt");

CREATE TABLE IF NOT EXISTS "PostComment" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"     TEXT NOT NULL,
  "postId"     TEXT,
  "targetType" TEXT NOT NULL DEFAULT 'post',
  "targetId"   TEXT NOT NULL DEFAULT '',
  "body"       TEXT NOT NULL,
  "parentId"   TEXT,
  "likeCount"  INTEGER NOT NULL DEFAULT 0,
  "isHidden"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ArtistPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PostComment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PostComment_postId_idx" ON "PostComment"("postId");
CREATE INDEX IF NOT EXISTS "PostComment_userId_idx" ON "PostComment"("userId");
CREATE INDEX IF NOT EXISTS "PostComment_target_idx" ON "PostComment"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "PostComment_parentId_idx" ON "PostComment"("parentId");

-- ── NOTIFICATIONS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "actorId"     TEXT,
  "actorName"   TEXT NOT NULL DEFAULT '',
  "actorPhoto"  TEXT NOT NULL DEFAULT '',
  "targetType"  TEXT NOT NULL DEFAULT '',
  "targetId"    TEXT NOT NULL DEFAULT '',
  "targetSlug"  TEXT NOT NULL DEFAULT '',
  "targetTitle" TEXT NOT NULL DEFAULT '',
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL DEFAULT '',
  "actionUrl"   TEXT NOT NULL DEFAULT '',
  "isRead"      BOOLEAN NOT NULL DEFAULT false,
  "readAt"      TIMESTAMP(3),
  "emailSent"   BOOLEAN NOT NULL DEFAULT false,
  "pushSent"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_userId_created_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id"                  TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"              TEXT NOT NULL UNIQUE,
  "inAppFollows"        BOOLEAN NOT NULL DEFAULT true,
  "inAppLikes"          BOOLEAN NOT NULL DEFAULT true,
  "inAppComments"       BOOLEAN NOT NULL DEFAULT true,
  "inAppMessages"       BOOLEAN NOT NULL DEFAULT true,
  "inAppPurchases"      BOOLEAN NOT NULL DEFAULT true,
  "inAppReleases"       BOOLEAN NOT NULL DEFAULT true,
  "inAppMilestones"     BOOLEAN NOT NULL DEFAULT true,
  "inAppModeration"     BOOLEAN NOT NULL DEFAULT true,
  "emailPurchases"      BOOLEAN NOT NULL DEFAULT true,
  "emailFollows"        BOOLEAN NOT NULL DEFAULT false,
  "emailMessages"       BOOLEAN NOT NULL DEFAULT true,
  "emailReleases"       BOOLEAN NOT NULL DEFAULT true,
  "emailMilestones"     BOOLEAN NOT NULL DEFAULT true,
  "emailWeeklyDigest"   BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled"         BOOLEAN NOT NULL DEFAULT false,
  "pushToken"           TEXT NOT NULL DEFAULT '',
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── MESSAGING ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MessageConversation" (
  "id"                  TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "participant1"        TEXT NOT NULL,
  "participant2"        TEXT NOT NULL,
  "lastMessageAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessagePreview"  TEXT NOT NULL DEFAULT '',
  "unread1"             INTEGER NOT NULL DEFAULT 0,
  "unread2"             INTEGER NOT NULL DEFAULT 0,
  "isArchived1"         BOOLEAN NOT NULL DEFAULT false,
  "isArchived2"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageConversation_unique" UNIQUE ("participant1", "participant2")
);
CREATE INDEX IF NOT EXISTS "MessageConversation_p1_idx" ON "MessageConversation"("participant1");
CREATE INDEX IF NOT EXISTS "MessageConversation_p2_idx" ON "MessageConversation"("participant2");
CREATE INDEX IF NOT EXISTS "MessageConversation_lastMsg_idx" ON "MessageConversation"("lastMessageAt");

CREATE TABLE IF NOT EXISTS "Message" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "conversationId" TEXT NOT NULL,
  "senderId"       TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "attachments"    JSONB NOT NULL DEFAULT '[]',
  "isRead"         BOOLEAN NOT NULL DEFAULT false,
  "readAt"         TIMESTAMP(3),
  "isFlagged"      BOOLEAN NOT NULL DEFAULT false,
  "flagReason"     TEXT NOT NULL DEFAULT '',
  "isDeleted"      BOOLEAN NOT NULL DEFAULT false,
  "deletedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessageConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Message_conv_created_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");

-- ── DISCOVERY ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "TrendingSnapshot" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "period"      TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "items"       JSONB NOT NULL DEFAULT '[]',
  "computedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TrendingSnapshot_period_cat_idx" ON "TrendingSnapshot"("period", "category");
CREATE INDEX IF NOT EXISTS "TrendingSnapshot_computedAt_idx" ON "TrendingSnapshot"("computedAt");

CREATE TABLE IF NOT EXISTS "SearchIndex" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "entityType"  TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "subtitle"    TEXT NOT NULL DEFAULT '',
  "tags"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "genre"       TEXT NOT NULL DEFAULT '',
  "imageUrl"    TEXT NOT NULL DEFAULT '',
  "slug"        TEXT NOT NULL DEFAULT '',
  "score"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchIndex_entity_unique" UNIQUE ("entityType", "entityId")
);
CREATE INDEX IF NOT EXISTS "SearchIndex_entityType_idx" ON "SearchIndex"("entityType");
CREATE INDEX IF NOT EXISTS "SearchIndex_score_idx" ON "SearchIndex"("score");
-- Full-text search index (GIN tsvector)
CREATE INDEX IF NOT EXISTS "SearchIndex_fts_idx" ON "SearchIndex"
  USING GIN(to_tsvector('english', "title" || ' ' || "subtitle" || ' ' || "genre"));

-- ── ANALYTICS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AnalyticsDailyRollup" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"     TEXT NOT NULL,
  "date"         TEXT NOT NULL,
  "profileViews" INTEGER NOT NULL DEFAULT 0,
  "storeViews"   INTEGER NOT NULL DEFAULT 0,
  "beatPlays"    INTEGER NOT NULL DEFAULT 0,
  "releasePlays" INTEGER NOT NULL DEFAULT 0,
  "videoPlays"   INTEGER NOT NULL DEFAULT 0,
  "beatSales"    INTEGER NOT NULL DEFAULT 0,
  "releaseSales" INTEGER NOT NULL DEFAULT 0,
  "videoSales"   INTEGER NOT NULL DEFAULT 0,
  "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newFollowers" INTEGER NOT NULL DEFAULT 0,
  "lostFollowers" INTEGER NOT NULL DEFAULT 0,
  "likes"        INTEGER NOT NULL DEFAULT 0,
  "comments"     INTEGER NOT NULL DEFAULT 0,
  "reposts"      INTEGER NOT NULL DEFAULT 0,
  "shares"       INTEGER NOT NULL DEFAULT 0,
  "newMessages"  INTEGER NOT NULL DEFAULT 0,
  "newInquiries" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsDailyRollup_unique" UNIQUE ("artistId", "date")
);
CREATE INDEX IF NOT EXISTS "AnalyticsDailyRollup_artistId_idx" ON "AnalyticsDailyRollup"("artistId");
CREATE INDEX IF NOT EXISTS "AnalyticsDailyRollup_date_idx" ON "AnalyticsDailyRollup"("date");

CREATE TABLE IF NOT EXISTS "GeographyEvent" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"     TEXT NOT NULL,
  "countryCode"  TEXT NOT NULL,
  "countryName"  TEXT NOT NULL DEFAULT '',
  "city"         TEXT NOT NULL DEFAULT '',
  "eventType"    TEXT NOT NULL,
  "count"        INTEGER NOT NULL DEFAULT 1,
  "period"       TEXT NOT NULL,
  CONSTRAINT "GeographyEvent_unique" UNIQUE ("artistId", "countryCode", "eventType", "period")
);
CREATE INDEX IF NOT EXISTS "GeographyEvent_artistId_idx" ON "GeographyEvent"("artistId");
CREATE INDEX IF NOT EXISTS "GeographyEvent_period_idx" ON "GeographyEvent"("period");

CREATE TABLE IF NOT EXISTS "PageView" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"    TEXT,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT NOT NULL,
  "userId"      TEXT,
  "userAgent"   TEXT NOT NULL DEFAULT '',
  "country"     TEXT NOT NULL DEFAULT '',
  "referrer"    TEXT NOT NULL DEFAULT '',
  "sessionId"   TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PageView_artistId_type_idx" ON "PageView"("artistId", "targetType");
CREATE INDEX IF NOT EXISTS "PageView_target_idx" ON "PageView"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "PageView_createdAt_idx" ON "PageView"("createdAt");

-- ── MODERATION + TRUST ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AbuseReport" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reporterUserId" TEXT,
  "reporterEmail"  TEXT NOT NULL DEFAULT '',
  "targetType"     TEXT NOT NULL,
  "targetId"       TEXT NOT NULL,
  "targetTitle"    TEXT NOT NULL DEFAULT '',
  "reason"         TEXT NOT NULL,
  "category"       TEXT NOT NULL DEFAULT 'other',
  "description"    TEXT NOT NULL DEFAULT '',
  "evidence"       JSONB NOT NULL DEFAULT '[]',
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "assignedTo"     TEXT NOT NULL DEFAULT '',
  "adminNotes"     TEXT NOT NULL DEFAULT '',
  "actionTaken"    TEXT NOT NULL DEFAULT '',
  "resolvedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AbuseReport_status_idx" ON "AbuseReport"("status");
CREATE INDEX IF NOT EXISTS "AbuseReport_category_idx" ON "AbuseReport"("category");
CREATE INDEX IF NOT EXISTS "AbuseReport_target_idx" ON "AbuseReport"("targetType", "targetId");

CREATE TABLE IF NOT EXISTS "ModerationAction" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "adminEmail"  TEXT NOT NULL,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "reason"      TEXT NOT NULL DEFAULT '',
  "notes"       TEXT NOT NULL DEFAULT '',
  "reversedAt"  TIMESTAMP(3),
  "reversedBy"  TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ModerationAction_target_idx" ON "ModerationAction"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "ModerationAction_admin_idx" ON "ModerationAction"("adminEmail");

CREATE TABLE IF NOT EXISTS "ContentFlag" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "contentType" TEXT NOT NULL,
  "contentId"   TEXT NOT NULL,
  "flagType"    TEXT NOT NULL,
  "reason"      TEXT NOT NULL DEFAULT '',
  "flaggedBy"   TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentFlag_unique" UNIQUE ("contentType", "contentId", "flagType")
);
CREATE INDEX IF NOT EXISTS "ContentFlag_type_flag_idx" ON "ContentFlag"("contentType", "flagType");

CREATE TABLE IF NOT EXISTS "VerificationRequest" (
  "id"               TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"         TEXT NOT NULL UNIQUE,
  "idDocumentUrl"    TEXT NOT NULL DEFAULT '',
  "socialLinks"      JSONB NOT NULL DEFAULT '{}',
  "monthlyListeners" INTEGER NOT NULL DEFAULT 0,
  "totalStreams"      INTEGER NOT NULL DEFAULT 0,
  "notes"            TEXT NOT NULL DEFAULT '',
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "adminNotes"       TEXT NOT NULL DEFAULT '',
  "reviewedBy"       TEXT NOT NULL DEFAULT '',
  "reviewedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationRequest_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VerificationRequest_status_idx" ON "VerificationRequest"("status");

CREATE TABLE IF NOT EXISTS "SpamSignal" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT,
  "ipHash"      TEXT NOT NULL DEFAULT '',
  "action"      TEXT NOT NULL,
  "count"       INTEGER NOT NULL DEFAULT 1,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "isFlagged"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SpamSignal_userId_action_idx" ON "SpamSignal"("userId", "action");
CREATE INDEX IF NOT EXISTS "SpamSignal_ip_action_idx" ON "SpamSignal"("ipHash", "action");
CREATE INDEX IF NOT EXISTS "SpamSignal_window_idx" ON "SpamSignal"("windowStart");
