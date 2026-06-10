-- Migration: Ensure merch checkout + membership revenue tracking columns exist
-- Safe to re-run (all IF NOT EXISTS)

-- Purchase: add merchId FK if not already present (schema.prisma already defines it)
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "merchId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_merchId_fkey' AND table_name = 'Purchase'
  ) THEN
    ALTER TABLE "Purchase"
      ADD CONSTRAINT "Purchase_merchId_fkey"
      FOREIGN KEY ("merchId") REFERENCES "Merch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Purchase_merchId_idx" ON "Purchase" ("merchId");

-- RevenueRecord: ensure 'membership' and 'merch' are valid (no enum — just a String column, already fine)
-- ArtistPayout: no schema changes needed

-- SupportTxn: ensure payfastPaymentId column exists (some older deployments may be missing it)
ALTER TABLE "SupportTxn"
  ADD COLUMN IF NOT EXISTS "payfastPaymentId" TEXT;
