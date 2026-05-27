-- ============================================================
-- VUKA — Phase 4 Final Hardening Migration
-- Safe to run on any Vuka-main + Phase 3 database.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Run: npx prisma migrate deploy
-- ============================================================

-- ── Fix false "0% fee" in artist sale emails (data integrity) ──
UPDATE "Purchase"
SET
  "platformFee" = ROUND(("amount" * 0.02)::NUMERIC, 2),
  "netAmount"   = ROUND(("amount" * 0.98)::NUMERIC, 2)
WHERE "status" = 'confirmed'
  AND "platformFee" = 0
  AND "amount"      > 0;

-- ── AdminLog: add Phase 4 columns ──
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "actorId"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "severity"  TEXT NOT NULL DEFAULT 'info';

-- ── ModerationAction: add adminId ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ModerationAction' AND column_name='adminId'
  ) THEN
    ALTER TABLE "ModerationAction" ADD COLUMN "adminId" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- ── ContentFlag: add updatedAt ──
ALTER TABLE "ContentFlag" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- ── VerificationRequest: add reviewedAt, adminNotes ──
ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "reviewedAt"  TIMESTAMP(3);
ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "adminNotes"  TEXT NOT NULL DEFAULT '';

-- ── NotificationPreference: per-type email flags ──
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "emailMessages"   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "emailFollowers"  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "emailSales"      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "emailMilestones" BOOLEAN NOT NULL DEFAULT TRUE;

-- ── ArtistPost: ensure all Phase 4 columns exist ──
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "publishedAt"  TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "isPublished"  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "likeCount"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "repostCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "isPinned"     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkUrl"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkType"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkItemId"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "mediaUrls"    TEXT[] NOT NULL DEFAULT '{}';

-- ── PostComment: phase 4 columns ──
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "isDeleted"  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "beatId"     TEXT;
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "releaseId"  TEXT;
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "parentId"   TEXT;

-- ── EngagementEvent: meta column ──
ALTER TABLE "EngagementEvent" ADD COLUMN IF NOT EXISTS "meta" JSONB NOT NULL DEFAULT '{}';

-- ── WishlistItem: add unique constraint to prevent duplicates ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WishlistItem_userId_itemType_itemId_key'
  ) THEN
    ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_itemType_itemId_key"
      UNIQUE ("userId", "itemType", "itemId");
  END IF;
END $$;

-- ── BeatLicense: add isRevoked + revokedReason if missing ──
ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "isRevoked"     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "revokedReason" TEXT    NOT NULL DEFAULT '';

-- ── ArtistBankAccount: masked number ──
ALTER TABLE "ArtistBankAccount" ADD COLUMN IF NOT EXISTS "maskedNumber" TEXT NOT NULL DEFAULT '';

-- ── RevenueRecord: updatedAt ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='RevenueRecord' AND column_name='updatedAt'
  ) THEN
    ALTER TABLE "RevenueRecord" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- ── DistributionRelease: updatedAt ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='DistributionRelease' AND column_name='updatedAt'
  ) THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- ════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_userid_read
  ON "Notification" ("userId", "isRead");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_createdat
  ON "Notification" ("createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engagement_event_user_type
  ON "EngagementEvent" ("userId", "eventType", "targetType");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engagement_event_target
  ON "EngagementEvent" ("targetType", "targetId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artist_post_artist_published
  ON "ArtistPost" ("artistId", "isPublished", "publishedAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_conversation_participants
  ON "MessageConversation" ("participant1", "participant2");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_conv_lastmsg
  ON "MessageConversation" ("lastMessageAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_conversation_id_deleted
  ON "Message" ("conversationId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_index_entity
  ON "SearchIndex" ("entityType", "isActive", "score" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_index_title_gin
  ON "SearchIndex" USING gin(to_tsvector('english', "title"));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_index_title_lower
  ON "SearchIndex" (LOWER("title") text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trending_snapshot_period_cat
  ON "TrendingSnapshot" ("period", "category", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_rollup_artist_date
  ON "AnalyticsDailyRollup" ("artistId", "date");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_geography_event_artist
  ON "GeographyEvent" ("artistId", "eventType", "period");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spam_signal_user_action
  ON "SpamSignal" ("userId", "action", "windowStart");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_abuse_report_status
  ON "AbuseReport" ("status", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_page_view_artist_createdat
  ON "PageView" ("artistId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_status_createdat
  ON "Purchase" ("status", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artist_payout_artist_status
  ON "ArtistPayout" ("artistId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follow_artistid
  ON "Follow" ("artistId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_log_action
  ON "AdminLog" ("action", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_buyer_email
  ON "Purchase" ("buyerEmail");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_download_token
  ON "Purchase" ("downloadToken");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beat_license_key
  ON "BeatLicense" ("licenseKey");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_distribution_release_artist_status
  ON "DistributionRelease" ("artistId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_revenue_record_artist
  ON "RevenueRecord" ("artistId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_membership_artist
  ON "CreatorMembership" ("artistId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_marketplace_service_category
  ON "MarketplaceService" ("category", "isActive");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payout_request_artist_status
  ON "PayoutRequest" ("artistId", "status");
