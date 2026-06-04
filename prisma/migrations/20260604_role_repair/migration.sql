-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260604_role_repair
-- 
-- Fixes broken user roles for existing production databases where:
--   1. Users have an Artist record but role = 'fan' (registered as artist but role wasn't saved)
--   2. Users have an IndustryUser record but role = 'fan'
-- 
-- This is a DATA fix, not a schema change. Fully idempotent and non-destructive.
-- Never downgrades admin/owner/moderator roles.
-- ─────────────────────────────────────────────────────────────────────────────

-- Fix: Users with an Artist record but non-artist role (except admins)
-- This is the most common case — artist registered but role saved as 'fan'
UPDATE "User" u
SET "role" = 'artist'
WHERE
  EXISTS (SELECT 1 FROM "Artist" a WHERE a."userId" = u."id")
  AND u."role" NOT IN ('artist', 'producer', 'verified_artist', 'admin', 'owner', 'super_admin', 'moderator');

-- Fix: Users with an IndustryUser record but wrong role (except admins and artists)
UPDATE "User" u
SET "role" = 'industry'
WHERE
  EXISTS (SELECT 1 FROM "IndustryUser" i WHERE i."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "Artist" a WHERE a."userId" = u."id")
  AND u."role" NOT IN ('industry', 'admin', 'owner', 'super_admin', 'moderator');

-- Log how many were fixed (visible in migration output)
DO $$
DECLARE
  artist_count INT;
  industry_count INT;
BEGIN
  SELECT COUNT(*) INTO artist_count
  FROM "User" u
  WHERE EXISTS (SELECT 1 FROM "Artist" a WHERE a."userId" = u."id")
    AND u."role" = 'artist';
    
  SELECT COUNT(*) INTO industry_count
  FROM "User" u
  WHERE EXISTS (SELECT 1 FROM "IndustryUser" i WHERE i."userId" = u."id")
    AND u."role" = 'industry';
    
  RAISE NOTICE 'Role repair complete. Artists in DB: %. Industry users in DB: %', artist_count, industry_count;
END $$;
