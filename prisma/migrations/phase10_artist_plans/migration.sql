-- Phase 10: Artist subscription plans
-- Adds planSlug + planExpiresAt to Artist.
-- All existing artists default to 'free' (15% fee, no expiry).
-- planExpiresAt = NULL means the plan never auto-expires (paid ongoing).
-- planExpiresAt = a date means it's a trial/promo — auto-drops to Free after that date.

ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "planSlug"      TEXT      NOT NULL DEFAULT 'free';

ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "planExpiresAt" TIMESTAMP(3);

-- Index so the expiry cron job runs fast
CREATE INDEX IF NOT EXISTS "Artist_planExpiresAt_idx" ON "Artist"("planExpiresAt");

-- ── Promo upgrades ────────────────────────────────────────────
-- Add any artist emails below to give them 6 months Pro free.
-- Format: ('email@example.com')
-- ─────────────────────────────────────────────────────────────
UPDATE "Artist"
SET
  "planSlug"      = 'pro',
  "planExpiresAt" = NOW() + INTERVAL '6 months'
WHERE "userId" IN (
  SELECT id FROM "User" WHERE email IN (
    'itshepang26@gmail.com'
    -- add more emails here, comma separated:
    -- 'artist2@gmail.com',
    -- 'artist3@gmail.com'
  )
);
