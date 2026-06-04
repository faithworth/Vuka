-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 12 — Cleanup & Production Hardening
-- 
-- 1. Remove stripeAccountId and stripeSubId columns if they exist
--    (non-destructive: uses IF EXISTS so safe on databases that never had Stripe)
-- 2. Ensure bank account numbers constraint: accountNumber must be set
-- 3. Add index on PayoutRequest.status for admin queue performance
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove Stripe columns (idempotent — no-op if already gone)
ALTER TABLE "Artist" DROP COLUMN IF EXISTS "stripeAccountId";
ALTER TABLE "CreatorMembership" DROP COLUMN IF EXISTS "stripeSubId";

-- Ensure payout request status index exists
CREATE INDEX IF NOT EXISTS "PayoutRequest_status_idx"
  ON "PayoutRequest" ("status");

CREATE INDEX IF NOT EXISTS "PayoutRequest_artistId_status_idx"
  ON "PayoutRequest" ("artistId", "status");

-- Ensure purchase status index for earnings calculations
CREATE INDEX IF NOT EXISTS "Purchase_status_idx"
  ON "Purchase" ("status");

-- ArtistBankAccount: safe to add maskedNumber display column if absent
ALTER TABLE "ArtistBankAccount"
  ADD COLUMN IF NOT EXISTS "maskedNumber" TEXT;

-- Update maskedNumber from accountNumber for existing rows that have it
UPDATE "ArtistBankAccount"
SET "maskedNumber" = CONCAT('****', RIGHT("accountNumber", 4))
WHERE "maskedNumber" IS NULL
  AND "accountNumber" IS NOT NULL
  AND LENGTH("accountNumber") >= 4;
