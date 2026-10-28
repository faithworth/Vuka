-- Track why an artist is on a plan and store only processor fees that are actually known.
-- Existing monetary history is preserved; unknown processor fees remain NULL.
ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "planSource" TEXT NOT NULL DEFAULT 'free';

ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "processorFee" DOUBLE PRECISION;

ALTER TABLE "SupportTxn"
  ADD COLUMN IF NOT EXISTS "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "processorFee" DOUBLE PRECISION;

ALTER TABLE "artist_plan_subscriptions"
  ADD COLUMN IF NOT EXISTS "processorFee" DOUBLE PRECISION;

-- Do not fabricate historical tip fee splits: legacy rows retain zero defaults
-- and the shared revenue calculation will derive platform fees where possible.
-- Processor fee remains NULL because historical processor fees are not reliably stored.

-- Reclassify existing plans conservatively: known subscription records count as paid;
-- existing referral rewards count as referral-granted; other non-free plans stay unknown.
UPDATE "Artist" a
SET "planSource" = CASE
  WHEN a."planSlug" = 'free' THEN 'free'
  WHEN EXISTS (
    SELECT 1 FROM "artist_plan_subscriptions" s
    WHERE s."artistId" = a."id" AND s."status" = 'active'
  ) THEN 'paid'
  WHEN EXISTS (
    SELECT 1 FROM "User" u
    JOIN "referral_rewards" rr ON rr."userId" = u."id"
    WHERE u."id" = a."userId" AND rr."rewardType" = 'pro_3months'
  ) THEN 'referral_reward'
  ELSE 'unknown'
END;
