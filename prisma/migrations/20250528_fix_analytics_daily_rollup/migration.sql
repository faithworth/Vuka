-- Fix AnalyticsDailyRollup: create table if not exists, add all missing columns
-- Fully idempotent — safe to run on both fresh and existing databases
-- Root cause: phase3_social_engine was baselined (not executed), so the table
-- may not exist. This migration creates it if absent then adds any missing columns.

-- Step 0: Create the table if it does not exist
CREATE TABLE IF NOT EXISTS "AnalyticsDailyRollup" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"       TEXT NOT NULL,
  "date"           TEXT NOT NULL,
  "plays"          INTEGER NOT NULL DEFAULT 0,
  "beatPlays"      INTEGER NOT NULL DEFAULT 0,
  "releasePlays"   INTEGER NOT NULL DEFAULT 0,
  "videoPlays"     INTEGER NOT NULL DEFAULT 0,
  "profileViews"   INTEGER NOT NULL DEFAULT 0,
  "storeViews"     INTEGER NOT NULL DEFAULT 0,
  "pageViews"      INTEGER NOT NULL DEFAULT 0,
  "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
  "followers"      INTEGER NOT NULL DEFAULT 0,
  "unfollows"      INTEGER NOT NULL DEFAULT 0,
  "beatSales"      INTEGER NOT NULL DEFAULT 0,
  "releaseSales"   INTEGER NOT NULL DEFAULT 0,
  "revenue"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalRevenue"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tips"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "likes"          INTEGER NOT NULL DEFAULT 0,
  "comments"       INTEGER NOT NULL DEFAULT 0,
  "reposts"        INTEGER NOT NULL DEFAULT 0,
  "shares"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 1: Convert date column from TIMESTAMP to TEXT if it's still a timestamp type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AnalyticsDailyRollup'
      AND column_name = 'date'
      AND data_type IN ('timestamp without time zone', 'timestamp with time zone', 'date')
  ) THEN
    BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_artistId_date_key"; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_artistId_date_unique"; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_unique"; EXCEPTION WHEN OTHERS THEN NULL; END;
    ALTER TABLE "AnalyticsDailyRollup"
      ALTER COLUMN "date" TYPE TEXT USING TO_CHAR("date", 'YYYY-MM-DD');
  END IF;
END $$;

-- Step 2: Add all potentially missing columns (idempotent ADD COLUMN IF NOT EXISTS)
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "plays"          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "beatPlays"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "releasePlays"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "videoPlays"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "profileViews"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "storeViews"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "pageViews"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "uniqueVisitors" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "followers"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "unfollows"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "beatSales"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "releaseSales"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "revenue"        DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "totalRevenue"   DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "tips"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "likes"          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "comments"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "reposts"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "shares"         INTEGER NOT NULL DEFAULT 0;

-- Step 3: Drop any old unique constraint variants before creating the canonical one
DO $$
BEGIN
  BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_unique";            EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_artistId_date_key"; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_artistId_date_unique"; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Step 4: Add the Prisma-expected unique constraint (name: "artistId_date")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'artistId_date'
      AND conrelid = '"AnalyticsDailyRollup"'::regclass
  ) THEN
    ALTER TABLE "AnalyticsDailyRollup"
      ADD CONSTRAINT "artistId_date" UNIQUE ("artistId", "date");
  END IF;
END $$;

-- Step 5: Ensure composite index exists
CREATE INDEX IF NOT EXISTS "AnalyticsDailyRollup_artistId_date_idx"
  ON "AnalyticsDailyRollup"("artistId", "date");

-- Step 6: Add FK to Artist if not already present (non-fatal if Artist table doesn't exist yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AnalyticsDailyRollup_artistId_fkey'
      AND conrelid = '"AnalyticsDailyRollup"'::regclass
  ) THEN
    BEGIN
      ALTER TABLE "AnalyticsDailyRollup"
        ADD CONSTRAINT "AnalyticsDailyRollup_artistId_fkey"
        FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;
