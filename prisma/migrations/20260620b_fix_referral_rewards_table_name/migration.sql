-- Migration: Fix referral_rewards table name
-- The previous migration (20260619_founding_artist_autostepping_fees) created
-- the table as "ReferralReward" but the Prisma schema maps it to "referral_rewards"
-- via @@map("referral_rewards"). This renames the table to match.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ReferralReward'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'referral_rewards'
  ) THEN
    ALTER TABLE "ReferralReward" RENAME TO "referral_rewards";
  END IF;
END $$;

-- Recreate index under new table name if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'referral_rewards' AND indexname = 'referral_rewards_userId_idx'
  ) THEN
    CREATE INDEX "referral_rewards_userId_idx" ON "referral_rewards"("userId");
  END IF;
END $$;
