-- Add approvedAt to PayoutRequest
-- Tracks when an admin approved the payout request.
-- Used by the cron payout_process job to find stale approved payouts.
-- Safe to re-run: IF NOT EXISTS guard.
ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
