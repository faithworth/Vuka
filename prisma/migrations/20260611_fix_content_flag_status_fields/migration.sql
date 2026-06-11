-- Add status, reviewedBy, reviewedAt fields to ContentFlag
-- These fields are required by the admin security route for content moderation.
-- Safe to run multiple times (IF NOT EXISTS guards).

DO $$
BEGIN
  -- status column (default 'open')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ContentFlag' AND column_name = 'status'
  ) THEN
    ALTER TABLE "ContentFlag" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';
  END IF;

  -- reviewedBy (nullable FK to user id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ContentFlag' AND column_name = 'reviewedBy'
  ) THEN
    ALTER TABLE "ContentFlag" ADD COLUMN "reviewedBy" TEXT;
  END IF;

  -- reviewedAt (nullable timestamp)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ContentFlag' AND column_name = 'reviewedAt'
  ) THEN
    ALTER TABLE "ContentFlag" ADD COLUMN "reviewedAt" TIMESTAMP(3);
  END IF;
END $$;

-- Index for efficient admin queries
CREATE INDEX IF NOT EXISTS "ContentFlag_status_createdAt_idx" ON "ContentFlag"("status", "createdAt" DESC);
