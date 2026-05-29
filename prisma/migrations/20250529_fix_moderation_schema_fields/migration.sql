-- Migration: 20250529_fix_moderation_schema_fields
-- Adds missing fields to moderation models so moderation.ts compiles correctly.
-- All operations are idempotent (ADD COLUMN IF NOT EXISTS / safe renames).

-- ── AbuseReport: add adminNotes and resolvedAt ───────────────
DO $$ BEGIN
  ALTER TABLE "AbuseReport" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT NOT NULL DEFAULT '';
  ALTER TABLE "AbuseReport" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── ContentFlag: rename flagType → flag, add adminId and reason ──
-- Step 1: add the new column 'flag' if it does not exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ContentFlag' AND column_name = 'flagType') THEN
    -- Rename flagType → flag (safe — only runs if flagType still exists)
    ALTER TABLE "ContentFlag" RENAME COLUMN "flagType" TO "flag";
  ELSE
    -- flagType was already renamed or never existed; ensure 'flag' column exists
    ALTER TABLE "ContentFlag" ADD COLUMN IF NOT EXISTS "flag" TEXT NOT NULL DEFAULT '';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentFlag" ADD COLUMN IF NOT EXISTS "adminId" TEXT NOT NULL DEFAULT '';
  ALTER TABLE "ContentFlag" ADD COLUMN IF NOT EXISTS "reason"  TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Step 2: recreate unique index using new column name (drop old, create new)
DO $$ BEGIN
  DROP INDEX IF EXISTS "ContentFlag_targetType_targetId_flagType_key";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'ContentFlag'
      AND indexname  = 'ContentFlag_targetType_targetId_flag_key'
  ) THEN
    CREATE UNIQUE INDEX "ContentFlag_targetType_targetId_flag_key"
      ON "ContentFlag" ("targetType", "targetId", "flag");
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── DMCAReport: add itemType, itemId, itemTitle, adminNotes, resolvedAt ──
DO $$ BEGIN
  ALTER TABLE "DMCAReport" ADD COLUMN IF NOT EXISTS "itemType"   TEXT NOT NULL DEFAULT '';
  ALTER TABLE "DMCAReport" ADD COLUMN IF NOT EXISTS "itemId"     TEXT NOT NULL DEFAULT '';
  ALTER TABLE "DMCAReport" ADD COLUMN IF NOT EXISTS "itemTitle"  TEXT NOT NULL DEFAULT '';
  ALTER TABLE "DMCAReport" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT NOT NULL DEFAULT '';
  ALTER TABLE "DMCAReport" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Backfill itemType/itemId from existing contentType/contentId where empty
DO $$ BEGIN
  UPDATE "DMCAReport"
  SET "itemType" = "contentType",
      "itemId"   = "contentId"
  WHERE ("itemType" IS NULL OR "itemType" = '')
    AND ("contentType" IS NOT NULL AND "contentType" != '');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── VerificationRequest: add legalName, idDocumentUrl, socialProofUrl, additionalInfo ──
DO $$ BEGIN
  ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "legalName"      TEXT NOT NULL DEFAULT '';
  ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "idDocumentUrl"  TEXT NOT NULL DEFAULT '';
  ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "socialProofUrl" TEXT NOT NULL DEFAULT '';
  ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "additionalInfo" TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
