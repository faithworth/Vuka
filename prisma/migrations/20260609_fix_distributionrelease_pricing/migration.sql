-- Fix: DistributionRelease missing price/minPrice/payWhatYouWant columns.
-- The API (distribution/releases/route.ts) already reads/writes these fields
-- but they were never added to the DB — so all dist. release purchases defaulted to R0.
-- Also adds distributionReleaseId FK to Purchase so dist. sales are linked correctly.

-- ── DistributionRelease pricing columns ─────────────────────────────────────
ALTER TABLE "DistributionRelease"
  ADD COLUMN IF NOT EXISTS "price"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minPrice"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payWhatYouWant" BOOLEAN          NOT NULL DEFAULT false;

-- ── Purchase: distributionReleaseId FK ──────────────────────────────────────
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "distributionReleaseId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_distributionReleaseId_fkey'
      AND table_name = 'Purchase'
  ) THEN
    ALTER TABLE "Purchase"
      ADD CONSTRAINT "Purchase_distributionReleaseId_fkey"
      FOREIGN KEY ("distributionReleaseId")
      REFERENCES "DistributionRelease"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Purchase_distributionReleaseId_idx"
  ON "Purchase" ("distributionReleaseId");
