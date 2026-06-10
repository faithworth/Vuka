-- Migration: add artistId to Purchase for subscription/membership/marketplace rows
-- add billingInterval to CreatorMembership
-- Safe to re-run (all IF NOT EXISTS / DO $$ blocks)

-- Purchase: add direct artistId FK
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "artistId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_artistId_fkey' AND table_name = 'Purchase'
  ) THEN
    ALTER TABLE "Purchase"
      ADD CONSTRAINT "Purchase_artistId_fkey"
      FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Purchase_artistId_idx" ON "Purchase" ("artistId");

-- CreatorMembership: add billingInterval
ALTER TABLE "CreatorMembership"
  ADD COLUMN IF NOT EXISTS "billingInterval" TEXT NOT NULL DEFAULT 'monthly';

-- CreatorMembership: add pending to allowed statuses (comment only — String column, no enum)
-- status values: active | pending | cancelled | expired

-- SupportTxn: ensure payfastPaymentId column exists
ALTER TABLE "SupportTxn"
  ADD COLUMN IF NOT EXISTS "payfastPaymentId" TEXT;
