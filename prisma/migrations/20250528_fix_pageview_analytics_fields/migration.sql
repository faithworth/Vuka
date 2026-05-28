-- PageView: fully idempotent migration
-- Creates table if missing, then ensures all columns exist regardless

CREATE TABLE IF NOT EXISTS "PageView" (
  "id"         TEXT         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"   TEXT,
  "targetType" TEXT         NOT NULL DEFAULT '',
  "targetId"   TEXT         NOT NULL DEFAULT '',
  "userId"     TEXT,
  "userAgent"  TEXT         NOT NULL DEFAULT '',
  "country"    TEXT         NOT NULL DEFAULT '',
  "referrer"   TEXT         NOT NULL DEFAULT '',
  "sessionId"  TEXT         NOT NULL DEFAULT '',
  "path"       TEXT         NOT NULL DEFAULT '',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- If table pre-existed with artistId NOT NULL, make it nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PageView'
      AND column_name = 'artistId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "PageView" ALTER COLUMN "artistId" DROP NOT NULL;
  END IF;
END $$;

-- Add missing columns (all idempotent)
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "targetType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "targetId"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "userId"     TEXT;
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "sessionId"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "userAgent"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "path"       TEXT NOT NULL DEFAULT '';

-- FK: userId -> User
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PageView_userId_fkey'
  ) THEN
    ALTER TABLE "PageView"
      ADD CONSTRAINT "PageView_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- FK: artistId -> Artist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PageView_artistId_fkey'
  ) THEN
    ALTER TABLE "PageView"
      ADD CONSTRAINT "PageView_artistId_fkey"
      FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "PageView_artistId_createdAt_idx" ON "PageView"("artistId", "createdAt");
CREATE INDEX IF NOT EXISTS "PageView_targetType_targetId_idx" ON "PageView"("targetType", "targetId");
