-- AddColumn: distributor to DistributionRelease
-- This column tracks which distribution partner handled the release.
-- Defaults to 'Vuka' for all new and existing releases.

ALTER TABLE "DistributionRelease"
  ADD COLUMN IF NOT EXISTS "distributor" TEXT NOT NULL DEFAULT 'Vuka';
