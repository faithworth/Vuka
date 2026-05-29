-- Migration: 20250529_fix_schema_missing_fields
-- Adds missing fields to existing models. All operations are idempotent.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'BeatLicense') THEN
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "streams"       INTEGER;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "salesCap"      INTEGER;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "radioStations" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "tvSync"        BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "musicVideo"    BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "profitSharing" DOUBLE PRECISION NOT NULL DEFAULT 0;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "artistName"    TEXT NOT NULL DEFAULT '';
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "songTitle"     TEXT NOT NULL DEFAULT '';
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "issuedAt"      TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "expiresAt"     TIMESTAMPTZ;
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "pdfUrl"        TEXT NOT NULL DEFAULT '';
    -- artistId: add as nullable first, backfill from Beat, then enforce NOT NULL
    ALTER TABLE "BeatLicense" ADD COLUMN IF NOT EXISTS "artistId" TEXT;
    UPDATE "BeatLicense" bl
      SET "artistId" = b."artistId"
      FROM "Beat" b
      WHERE bl."beatId" = b."id" AND bl."artistId" IS NULL;
    -- Only set NOT NULL if all rows have been filled (safe even if table is empty)
    DO $inner$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM "BeatLicense" WHERE "artistId" IS NULL) THEN
        ALTER TABLE "BeatLicense" ALTER COLUMN "artistId" SET NOT NULL;
      END IF;
    END $inner$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'MessageConversation') THEN
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "lastMessagePreview" TEXT NOT NULL DEFAULT '';
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "unread1"            INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "unread2"            INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "isArchived1"        BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "isArchived2"        BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "MessageConversation" ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Message') THEN
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "readAt"      TIMESTAMPTZ;
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "isFlagged"   BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "flagReason"  TEXT NOT NULL DEFAULT '';
    ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt"   TIMESTAMPTZ;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PostComment') THEN
    BEGIN ALTER TABLE "PostComment" ALTER COLUMN "postId" DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "beatId"     TEXT;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "releaseId"  TEXT;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "targetType" TEXT NOT NULL DEFAULT 'post';
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "targetId"   TEXT NOT NULL DEFAULT '';
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "likeCount"  INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "isHidden"   BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "isDeleted"  BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'DistributionRelease') THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "retryCount"  INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "lastRetryAt" TIMESTAMPTZ;
  END IF;
END $$;
