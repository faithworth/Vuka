-- PageView: make artistId optional, add targetType, targetId, userId, sessionId, userAgent
-- and make path optional (default empty string)

-- Make artistId nullable
ALTER TABLE "PageView" ALTER COLUMN "artistId" DROP NOT NULL;

-- Add missing columns (idempotent)
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "targetType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "targetId"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "userId"     TEXT;
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "sessionId"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "userAgent"  TEXT NOT NULL DEFAULT '';

-- Make path optional (it may not always be set from analytics.ts)
ALTER TABLE "PageView" ALTER COLUMN "path" SET DEFAULT '';

-- Add FK for userId -> User
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

-- Add index on targetType, targetId
CREATE INDEX IF NOT EXISTS "PageView_targetType_targetId_idx" ON "PageView"("targetType", "targetId");
