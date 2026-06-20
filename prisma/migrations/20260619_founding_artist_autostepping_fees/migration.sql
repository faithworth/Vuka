-- Migration: Founding Artist Programme + Auto-stepping fees
-- Generated: 2026-06-19
-- Adds: isFoundingArtist, lifetimeGrossSales, referralCode, referredBy

-- Artist: founding artist badge + lifetime sales tracker for auto-stepping fee
ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "isFoundingArtist"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lifetimeGrossSales" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- User: referral system
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "referralCode"  TEXT,
  ADD COLUMN IF NOT EXISTS "referredBy"    TEXT;

-- Unique index for referral codes
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

-- Track referral reward grants (prevent double-granting)
CREATE TABLE IF NOT EXISTS "ReferralReward" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "rewardType" TEXT NOT NULL DEFAULT 'pro_3months',
  "grantedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralReward_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ReferralReward_userId_idx" ON "ReferralReward"("userId");
