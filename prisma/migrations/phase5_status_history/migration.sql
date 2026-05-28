-- Phase 5: Add statusHistory Json field to DistributionRelease
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "statusHistory" JSONB NOT NULL DEFAULT '[]';
