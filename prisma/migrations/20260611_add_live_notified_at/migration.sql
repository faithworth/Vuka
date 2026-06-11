-- Add liveNotifiedAt to DistributionRelease
-- Tracks whether the artist has been notified their release went live (cron notify_live job).
-- Safe to re-run: IF NOT EXISTS guard.
ALTER TABLE "DistributionRelease"
  ADD COLUMN IF NOT EXISTS "liveNotifiedAt" TIMESTAMP(3);
