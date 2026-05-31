-- =============================================================
-- prisma/migrations/add_production_hardening.sql
-- Run with: npx prisma db execute --file prisma/migrations/add_production_hardening.sql --schema prisma/schema.prisma
-- OR: use npx prisma migrate dev --name vuka_production_hardening (preferred)
-- =============================================================

-- 1. ISRC on Track, UPC on Release (also in add_isrc_upc.sql)
ALTER TABLE "Track"   ADD COLUMN IF NOT EXISTS "isrc" TEXT DEFAULT NULL;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "upc"  TEXT DEFAULT NULL;

-- 2. Artist profile additions
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "payfastMerchant" TEXT DEFAULT NULL;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "currency"        TEXT DEFAULT 'ZAR';
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "isVerified"      BOOLEAN DEFAULT FALSE;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "coverUrl"        TEXT DEFAULT NULL;

-- 3. ArtistPost feed fields
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "isPublished"  BOOLEAN   DEFAULT TRUE;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "publishedAt"  TIMESTAMP DEFAULT NOW();
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "likeCount"    INTEGER   DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER   DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "repostCount"  INTEGER   DEFAULT 0;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "isPinned"     BOOLEAN   DEFAULT FALSE;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkUrl"      TEXT      DEFAULT NULL;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkType"     TEXT      DEFAULT NULL;
ALTER TABLE "ArtistPost" ADD COLUMN IF NOT EXISTS "linkItemId"   TEXT      DEFAULT NULL;

-- 4. CreatorStorefront additions
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "headline"    TEXT    DEFAULT '';
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "description" TEXT    DEFAULT '';
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "theme"       TEXT    DEFAULT '#38b6e8';
ALTER TABLE "CreatorStorefront" ADD COLUMN IF NOT EXISTS "isPublic"    BOOLEAN DEFAULT TRUE;

-- 5. ArtistBankAccount table
CREATE TABLE IF NOT EXISTS "ArtistBankAccount" (
  "id"            TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "artistId"      TEXT      NOT NULL,
  "accountHolder" TEXT      NOT NULL,
  "bankName"      TEXT      NOT NULL,
  "branchCode"    TEXT      NOT NULL DEFAULT '',
  "maskedNumber"  TEXT      NOT NULL,
  "accountType"   TEXT      NOT NULL DEFAULT 'current',
  "isDefault"     BOOLEAN   NOT NULL DEFAULT FALSE,
  "isVerified"    BOOLEAN   NOT NULL DEFAULT FALSE,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "ArtistBankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ArtistBankAccount_artistId_idx" ON "ArtistBankAccount" ("artistId");

-- 6. PayoutRequest table
CREATE TABLE IF NOT EXISTS "PayoutRequest" (
  "id"            TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "artistId"      TEXT      NOT NULL,
  "bankAccountId" TEXT      NOT NULL,
  "amount"        DOUBLE PRECISION NOT NULL,
  "method"        TEXT      NOT NULL DEFAULT 'eft',
  "status"        TEXT      NOT NULL DEFAULT 'pending',
  "note"          TEXT,
  "adminNote"     TEXT,
  "processedAt"   TIMESTAMP,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PayoutRequest_artistId_idx" ON "PayoutRequest" ("artistId");
CREATE INDEX IF NOT EXISTS "PayoutRequest_status_idx"   ON "PayoutRequest" ("status");

-- 7. Notification table
CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT      NOT NULL,
  "type"      TEXT      NOT NULL,
  "title"     TEXT      NOT NULL,
  "body"      TEXT      NOT NULL,
  "isRead"    BOOLEAN   NOT NULL DEFAULT FALSE,
  "linkType"  TEXT      NOT NULL DEFAULT '',
  "linkId"    TEXT      NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx"   ON "Notification" ("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification" ("userId", "createdAt" DESC);

-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS "ArtistPost_artistId_publishedAt_idx" ON "ArtistPost" ("artistId", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "ArtistPayout_artistId_idx"           ON "ArtistPayout" ("artistId");
CREATE INDEX IF NOT EXISTS "Artist_payfastMerchant_idx"          ON "Artist" ("payfastMerchant") WHERE "payfastMerchant" IS NOT NULL;
