-- Migration: 20250529_fix_schema_missing_fields
-- Safely adds missing columns. Uses DO blocks to handle tables that may or may not exist.

-- BeatLicense
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'BeatLicense') THEN
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "streams"       INTEGER;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "salesCap"      INTEGER;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "radioStations" INTEGER;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "tvSync"        BOOLEAN  NOT NULL DEFAULT false;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "musicVideo"    BOOLEAN  NOT NULL DEFAULT false;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "profitSharing" TEXT     NOT NULL DEFAULT '';
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "artistName"    TEXT     NOT NULL DEFAULT '';
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "songTitle"     TEXT     NOT NULL DEFAULT '';
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "expiresAt"     TIMESTAMPTZ;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "artistId"      TEXT     NOT NULL DEFAULT '';
  END IF;
END $$;

-- MessageConversation
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'MessageConversation') THEN
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "lastMessagePreview" TEXT    NOT NULL DEFAULT '';
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "unread1"            INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "unread2"            INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- PostComment: make postId nullable, add beatId and releaseId
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PostComment') THEN
    ALTER TABLE "PostComment" ALTER COLUMN "postId" DROP NOT NULL;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "beatId"    TEXT;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "releaseId" TEXT;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- DistributionRelease
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'DistributionRelease') THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "retryCount"  INTEGER     NOT NULL DEFAULT 0;
    ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "lastRetryAt" TIMESTAMPTZ;
  END IF;
END $$;
