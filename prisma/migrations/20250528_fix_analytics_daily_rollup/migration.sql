-- Fix AnalyticsDailyRollup: add missing metric fields, convert date to String, rename unique constraint
-- All operations are fully idempotent

-- Step 1: Convert date column from TIMESTAMP to TEXT if it's still a timestamp
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AnalyticsDailyRollup'
      AND column_name = 'date'
      AND data_type IN ('timestamp without time zone', 'timestamp with time zone', 'date')
  ) THEN
    -- Drop old unique constraint if it exists (various possible names)
    BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_artistId_date_key"; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_artistId_date_unique"; EXCEPTION WHEN OTHERS THEN NULL; END;
    -- Convert column
    ALTER TABLE "AnalyticsDailyRollup"
      ALTER COLUMN "date" TYPE TEXT USING TO_CHAR("date", 'YYYY-MM-DD');
  END IF;
END $$;

-- Step 2: Add missing play/view metric columns
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "beatPlays"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "releasePlays"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "videoPlays"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "profileViews"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "storeViews"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "pageViews"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "uniqueVisitors" INTEGER NOT NULL DEFAULT 0;

-- Step 3: Add missing follower columns
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "unfollows"      INTEGER NOT NULL DEFAULT 0;

-- Step 4: Add missing sales columns
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "beatSales"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "releaseSales"   INTEGER NOT NULL DEFAULT 0;

-- Step 5: Add missing revenue columns
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "totalRevenue"   DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "tips"           DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Step 6: Add missing engagement columns
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "likes"          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "comments"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "reposts"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AnalyticsDailyRollup" ADD COLUMN IF NOT EXISTS "shares"         INTEGER NOT NULL DEFAULT 0;

-- Step 7: Recreate unique constraint with Prisma-expected name (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'artistId_date'
      AND conrelid = '"AnalyticsDailyRollup"'::regclass
  ) THEN
    BEGIN
      -- Drop any old variant first
      ALTER TABLE "AnalyticsDailyRollup" DROP CONSTRAINT IF EXISTS "AnalyticsDailyRollup_artistId_date_key";
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    ALTER TABLE "AnalyticsDailyRollup"
      ADD CONSTRAINT "artistId_date" UNIQUE ("artistId", "date");
  END IF;
END $$;

-- Step 8: Ensure the index exists
CREATE INDEX IF NOT EXISTS "AnalyticsDailyRollup_artistId_date_idx"
  ON "AnalyticsDailyRollup"("artistId", "date");
