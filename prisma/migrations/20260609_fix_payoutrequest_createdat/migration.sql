-- Fix: PayoutRequest.createdAt does not exist in production DB.
-- The original CREATE TABLE used `requestedAt` instead of `createdAt`.
-- Prisma schema and all queries expect `createdAt`.
--
-- Uses IF NOT EXISTS — safe to re-run.

ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Back-fill from requestedAt where the column exists on this DB
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PayoutRequest' AND column_name = 'requestedAt'
  ) THEN
    UPDATE "PayoutRequest"
      SET "createdAt" = "requestedAt"
      WHERE "requestedAt" IS NOT NULL;
  END IF;
END $$;
