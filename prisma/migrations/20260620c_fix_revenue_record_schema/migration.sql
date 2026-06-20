-- Migration: Fix RevenueRecord schema mismatch
-- The Prisma schema was redesigned from an aggregated (per-period) model to an
-- individual transaction model. The DB table is missing the columns:
--   type, amount, netAmount, platformFee, purchaseId
-- This migration adds them with safe defaults so existing rows keep working.

ALTER TABLE "RevenueRecord"
  ADD COLUMN IF NOT EXISTS "type"        TEXT NOT NULL DEFAULT 'beat_sale',
  ADD COLUMN IF NOT EXISTS "amount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "purchaseId"  TEXT;

-- Back-fill `amount` from `grossRevenue` (old column name) where it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RevenueRecord' AND column_name = 'grossRevenue'
  ) THEN
    UPDATE "RevenueRecord"
    SET "amount"      = COALESCE("grossRevenue", 0),
        "netAmount"   = COALESCE("netRevenue", 0),
        "platformFee" = COALESCE("platformFees", 0)
    WHERE "amount" = 0;
  END IF;
END $$;

-- Ensure updatedAt column exists (some early deployments omit it)
ALTER TABLE "RevenueRecord"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- period column: ensure it exists and has a default
ALTER TABLE "RevenueRecord"
  ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT '';
