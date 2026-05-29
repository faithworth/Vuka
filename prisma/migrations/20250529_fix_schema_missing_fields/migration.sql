-- Migration: 20250529_fix_schema_missing_fields
-- Adds missing fields to BeatLicense, MessageConversation, PostComment, DistributionRelease

-- BeatLicense: add license terms detail fields
ALTER TABLE "BeatLicense"
  ADD COLUMN IF NOT EXISTS "streams"       INTEGER,
  ADD COLUMN IF NOT EXISTS "salesCap"      INTEGER,
  ADD COLUMN IF NOT EXISTS "radioStations" INTEGER,
  ADD COLUMN IF NOT EXISTS "tvSync"        BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "musicVideo"    BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "profitSharing" TEXT     NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "artistName"    TEXT     NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "songTitle"     TEXT     NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "expiresAt"     TIMESTAMPTZ;

-- MessageConversation: add preview and unread counters
ALTER TABLE "MessageConversation"
  ADD COLUMN IF NOT EXISTS "lastMessagePreview" TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "unread1"            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unread2"            INTEGER NOT NULL DEFAULT 0;

-- PostComment: make postId nullable, add beatId and releaseId
ALTER TABLE "PostComment"
  ALTER COLUMN "postId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "beatId"     TEXT,
  ADD COLUMN IF NOT EXISTS "releaseId"  TEXT;

-- DistributionRelease: add retry tracking fields
ALTER TABLE "DistributionRelease"
  ADD COLUMN IF NOT EXISTS "retryCount"  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastRetryAt" TIMESTAMPTZ;
