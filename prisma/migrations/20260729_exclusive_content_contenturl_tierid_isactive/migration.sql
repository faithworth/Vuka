-- Adds contentUrl, tierId, isActive back to ExclusiveContent.
-- These were declared in schema.prisma but never migrated to production,
-- which crashed every "Create Content" attempt. Applied directly via
-- Supabase on 2026-07-29; this file records it in migration history.

ALTER TABLE "ExclusiveContent"
  ADD COLUMN IF NOT EXISTS "contentUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tierId" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "ExclusiveContent"
SET "contentUrl" = COALESCE(NULLIF("fileUrl", ''), NULLIF("externalUrl", ''), '')
WHERE "contentUrl" = '';

ALTER TABLE "ExclusiveContent"
  ADD CONSTRAINT "ExclusiveContent_tierId_fkey"
  FOREIGN KEY ("tierId") REFERENCES "CreatorSubscriptionTier"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ExclusiveContent_tierId_idx" ON "ExclusiveContent"("tierId");
CREATE INDEX IF NOT EXISTS "ExclusiveContent_isActive_idx" ON "ExclusiveContent"("isActive");
