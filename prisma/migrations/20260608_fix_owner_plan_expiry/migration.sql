-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260608_fix_owner_plan_expiry
--
-- The phase10_artist_plans migration originally set planExpiresAt = NOW() + 6 months
-- for promo/owner accounts. Those 6 months have now elapsed, so the nightly
-- expire-plans cron drops these accounts back to 'free'.
--
-- Fix: set planExpiresAt = NULL for owner/promo accounts.
-- NULL means "never expires" — getEffectivePlan() only drops to free when
-- expiresAt IS NOT NULL AND expiresAt < NOW().
--
-- Add any additional owner/promo emails below in the IN (...) list.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "Artist"
SET
  "planSlug"      = 'pro',
  "planExpiresAt" = NULL
WHERE "userId" IN (
  SELECT id FROM "User" WHERE email IN (
    'itshepang26@gmail.com'
    -- add more owner/promo emails here, comma-separated:
    -- 'owner2@gmail.com',
    -- 'promo3@gmail.com'
  )
);
