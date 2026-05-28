-- Add countryName column (defaults to empty string for existing rows)
ALTER TABLE "GeographyEvent" ADD COLUMN IF NOT EXISTS "countryName" TEXT NOT NULL DEFAULT '';

-- Add unique constraint so upsert works correctly
-- Drop any accidental duplicates first (keep the one with the highest count)
DELETE FROM "GeographyEvent" a
USING "GeographyEvent" b
WHERE a."artistId" = b."artistId"
  AND a."country"   = b."country"
  AND a."eventType" = b."eventType"
  AND a."period"    = b."period"
  AND a.id > b.id;

-- Now add the unique index
CREATE UNIQUE INDEX IF NOT EXISTS "GeographyEvent_artistId_country_eventType_period_key"
  ON "GeographyEvent" ("artistId", "country", "eventType", "period");
