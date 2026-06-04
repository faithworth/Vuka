-- Production hardening: add fields that were in add_production_hardening.sql
-- All idempotent with IF NOT EXISTS / IF EXISTS checks

-- Artist profile additions (required by schema.prisma)
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "payfastMerchant" TEXT DEFAULT NULL;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "currency"        TEXT NOT NULL DEFAULT 'ZAR';
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "isVerified"      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "coverUrl"        TEXT NOT NULL DEFAULT '';
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "totalPlays"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "isPublic"        BOOLEAN NOT NULL DEFAULT TRUE;

-- Track ISRC, Release UPC
ALTER TABLE "Track"   ADD COLUMN IF NOT EXISTS "isrc" TEXT DEFAULT NULL;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "upc"  TEXT DEFAULT NULL;

-- ArtistPost feed fields
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "isPublished"  BOOLEAN   NOT NULL DEFAULT TRUE;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "publishedAt"  TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "likeCount"    INTEGER   NOT NULL DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER   NOT NULL DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "repostCount"  INTEGER   NOT NULL DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "isPinned"     BOOLEAN   NOT NULL DEFAULT FALSE;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkUrl"      TEXT      NOT NULL DEFAULT '';
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkType"     TEXT      NOT NULL DEFAULT '';
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkItemId"   TEXT      NOT NULL DEFAULT '';

-- CreatorStorefront additions (required by schema.prisma)
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "headline"    TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "description" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "theme"       TEXT    NOT NULL DEFAULT '#38b6e8';
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "isPublic"    BOOLEAN NOT NULL DEFAULT TRUE;

-- Performance indexes
CREATE INDEX IF NOT EXISTS "ArtistPost_artistId_publishedAt_idx" ON "ArtistPost" ("artistId", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "ArtistPayout_artistId_idx"           ON "ArtistPayout" ("artistId");
CREATE INDEX IF NOT EXISTS "Artist_payfastMerchant_idx"          ON "Artist" ("payfastMerchant") WHERE "payfastMerchant" IS NOT NULL;
