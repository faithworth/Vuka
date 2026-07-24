-- Found via Supabase's own performance advisor after the previous index pass.
-- Purchase.releaseId is the highest-value one here — Purchase is the busiest
-- table in the app and this FK had no index at all.

CREATE INDEX IF NOT EXISTS "CreatorMembership_tierId_idx" ON "CreatorMembership"("tierId");
CREATE INDEX IF NOT EXISTS "Purchase_releaseId_idx" ON "Purchase"("releaseId");
CREATE INDEX IF NOT EXISTS "StoryView_userId_idx" ON "StoryView"("userId");
CREATE INDEX IF NOT EXISTS "award_nominations_artistId_idx" ON "award_nominations"("artistId");
CREATE INDEX IF NOT EXISTS "award_votes_userId_idx" ON "award_votes"("userId");
CREATE INDEX IF NOT EXISTS "fan_referrals_refereeId_idx" ON "fan_referrals"("refereeId");
CREATE INDEX IF NOT EXISTS "label_artists_artistId_idx" ON "label_artists"("artistId");
CREATE INDEX IF NOT EXISTS "label_team_members_userId_idx" ON "label_team_members"("userId");

-- referral_rewards had two identical indexes on userId (ReferralReward_userId_idx
-- and referral_rewards_userId_idx) — pure waste, drop one.
DROP INDEX IF EXISTS "ReferralReward_userId_idx";

-- ArtistBankAccount had two RLS policies doing the same job: one scoped to the
-- service_role role directly (qual=true, cheap), and a redundant one scoped to
-- `public` that re-evaluates current_setting('role') on every row to check the
-- same thing. Dropping the redundant one — it never actually let through any
-- connection the first policy didn't already cover.
DROP POLICY IF EXISTS "service_role_bypass" ON "ArtistBankAccount";
