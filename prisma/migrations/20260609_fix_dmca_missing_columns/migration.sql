-- Fix DMCAReport table: add any columns that existed in schema but were
-- missing from the DB because the table was created before these fields
-- were added. All IF NOT EXISTS — safe to run on any DB state.

ALTER TABLE "DMCAReport"
  ADD COLUMN IF NOT EXISTS "contentType"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "contentId"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "itemType"      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "itemId"        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "itemTitle"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "claimantName"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "claimantEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "description"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "status"        TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "adminNotes"    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "resolvedAt"    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "DMCAReport_artistId_idx" ON "DMCAReport"("artistId");
CREATE INDEX IF NOT EXISTS "DMCAReport_status_idx"   ON "DMCAReport"("status");
