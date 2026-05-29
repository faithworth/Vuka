-- Migration: 20250529_fix_moderation_schema_fields
-- Brings the live DB in sync with what moderation.ts and the updated schema.prisma expect.
-- All statements are fully idempotent. Safe to re-run.
--
-- What we know about the REAL live DB (from phase3 + phase4 migrations):
--   AbuseReport      — already has adminNotes, resolvedAt  ✓
--   ContentFlag      — has contentType/contentId/flagType/reason/flaggedBy (no adminId, no isActive)
--   ModerationAction — has adminEmail/targetType/targetId/action/reason/notes/adminId
--   VerificationRequest — has idDocumentUrl/socialLinks/notes/adminNotes/reviewedAt (no legalName/socialProofUrl/additionalInfo)
--   DMCAReport       — does NOT exist yet  → CREATE it

-- ══════════════════════════════════════════════════════════════════
-- 1. AbuseReport: add any columns that may be missing (safe no-ops
--    if phase3 already created them)
-- ══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE "AbuseReport" ADD COLUMN IF NOT EXISTS "adminNotes"  TEXT        NOT NULL DEFAULT '';
  ALTER TABLE "AbuseReport" ADD COLUMN IF NOT EXISTS "actionTaken" TEXT        NOT NULL DEFAULT '';
  ALTER TABLE "AbuseReport" ADD COLUMN IF NOT EXISTS "assignedTo"  TEXT        NOT NULL DEFAULT '';
  ALTER TABLE "AbuseReport" ADD COLUMN IF NOT EXISTS "resolvedAt"  TIMESTAMPTZ;
  ALTER TABLE "AbuseReport" ADD COLUMN IF NOT EXISTS "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 2. ContentFlag: add adminId and isActive columns.
--    Keep existing contentType / contentId / flagType column names —
--    do NOT rename them (moderation.ts now uses those real names).
-- ══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE "ContentFlag" ADD COLUMN IF NOT EXISTS "adminId"  TEXT    NOT NULL DEFAULT '';
  ALTER TABLE "ContentFlag" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 3. ModerationAction: add reportId column so moderation.ts can
--    store the AbuseReport link on new actions.
-- ══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE "ModerationAction" ADD COLUMN IF NOT EXISTS "reportId" TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 4. VerificationRequest: add new fields used by moderation.ts
-- ══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "legalName"      TEXT NOT NULL DEFAULT '';
  ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "socialProofUrl" TEXT NOT NULL DEFAULT '';
  ALTER TABLE "VerificationRequest" ADD COLUMN IF NOT EXISTS "additionalInfo" TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 5. DMCAReport: create table from scratch (does not exist in DB yet)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DMCAReport" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "artistId"      TEXT        NOT NULL,
  "contentType"   TEXT        NOT NULL DEFAULT '',
  "contentId"     TEXT        NOT NULL DEFAULT '',
  "itemType"      TEXT        NOT NULL DEFAULT '',
  "itemId"        TEXT        NOT NULL DEFAULT '',
  "itemTitle"     TEXT        NOT NULL DEFAULT '',
  "claimantName"  TEXT        NOT NULL DEFAULT '',
  "claimantEmail" TEXT        NOT NULL DEFAULT '',
  "description"   TEXT        NOT NULL DEFAULT '',
  "status"        TEXT        NOT NULL DEFAULT 'pending',
  "adminNotes"    TEXT        NOT NULL DEFAULT '',
  "resolvedAt"    TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "DMCAReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DMCAReport_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DMCAReport_artistId_idx"  ON "DMCAReport"("artistId");
CREATE INDEX IF NOT EXISTS "DMCAReport_status_idx"    ON "DMCAReport"("status");
