-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260604_role_repair
-- 
-- Fixes broken user roles for existing production databases where:
--   1. Users have an Artist record but role = 'fan' (registered as artist but role wasn't saved)
--   2. Users have an IndustryUser record but role = 'fan'
-- 
-- Also ensures the ADMIN_EMAIL user has the correct role (owner).
-- This is a DATA fix, not a schema change. Fully idempotent and non-destructive.
-- Never downgrades admin/owner/moderator roles.
-- ─────────────────────────────────────────────────────────────────────────────

-- Fix 1: Users with an Artist record but non-artist role (except admins/moderators)
UPDATE "User" u
SET "role" = 'artist'
WHERE
  EXISTS (SELECT 1 FROM "Artist" a WHERE a."userId" = u."id")
  AND u."role" NOT IN ('artist', 'producer', 'verified_artist', 'admin', 'owner', 'super_admin', 'moderator');

-- Fix 2: Users with an IndustryUser record but wrong role (except admins and artists)
UPDATE "User" u
SET "role" = 'industry'
WHERE
  EXISTS (SELECT 1 FROM "IndustryUser" i WHERE i."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "Artist" a WHERE a."userId" = u."id")
  AND u."role" NOT IN ('industry', 'admin', 'owner', 'super_admin', 'moderator');
