-- Migration: Plaques, Crowdfunding Campaigns, Split Sheets
-- Generated: 2026-06-20

-- ── ARTIST PLAQUES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "artist_plaques" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "artistId"     TEXT NOT NULL,
  "tier"         TEXT NOT NULL,
  "dimension"    TEXT NOT NULL,
  "milestone"    DOUBLE PRECISION NOT NULL,
  "shareableUrl" TEXT NOT NULL DEFAULT '',
  "earnedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_plaques_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "artist_plaques_artistId_tier_dimension_key"
  ON "artist_plaques"("artistId", "tier", "dimension");
CREATE INDEX IF NOT EXISTS "artist_plaques_artistId_idx" ON "artist_plaques"("artistId");

-- ── CAMPAIGNS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "artistId"      TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT NOT NULL DEFAULT '',
  "coverUrl"      TEXT NOT NULL DEFAULT '',
  "targetAmount"  DOUBLE PRECISION NOT NULL,
  "currentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency"      TEXT NOT NULL DEFAULT 'ZAR',
  "deadline"      TIMESTAMP(3) NOT NULL,
  "campaignType"  TEXT NOT NULL DEFAULT 'flexible',
  "status"        TEXT NOT NULL DEFAULT 'draft',
  "slug"          TEXT NOT NULL,
  "backerCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaigns_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_slug_key" ON "campaigns"("slug");
CREATE INDEX IF NOT EXISTS "campaigns_artistId_status_idx" ON "campaigns"("artistId", "status");

CREATE TABLE IF NOT EXISTS "campaign_tiers" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "campaignId"  TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "amount"      DOUBLE PRECISION NOT NULL,
  "perks"       TEXT[] NOT NULL DEFAULT '{}',
  "maxBackers"  INTEGER,
  "backerCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_tiers_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "campaign_tiers_campaignId_idx" ON "campaign_tiers"("campaignId");

CREATE TABLE IF NOT EXISTS "campaign_backers" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "campaignId"        TEXT NOT NULL,
  "tierId"            TEXT,
  "userId"            TEXT,
  "backerName"        TEXT NOT NULL,
  "backerEmail"       TEXT NOT NULL,
  "amount"            DOUBLE PRECISION NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'ZAR',
  "paystackReference" TEXT,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "anonymous"         BOOLEAN NOT NULL DEFAULT false,
  "message"           TEXT NOT NULL DEFAULT '',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_backers_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "campaign_backers_tierId_fkey"
    FOREIGN KEY ("tierId") REFERENCES "campaign_tiers"("id")
);
CREATE INDEX IF NOT EXISTS "campaign_backers_campaignId_status_idx"
  ON "campaign_backers"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "campaign_backers_backerEmail_idx"
  ON "campaign_backers"("backerEmail");

-- ── SPLIT SHEETS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "split_sheets" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "artistId"  TEXT NOT NULL,
  "itemType"  TEXT NOT NULL,
  "itemId"    TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "isLocked"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "split_sheets_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "split_sheets_itemType_itemId_key"
  ON "split_sheets"("itemType", "itemId");
CREATE INDEX IF NOT EXISTS "split_sheets_artistId_idx" ON "split_sheets"("artistId");

CREATE TABLE IF NOT EXISTS "split_recipients" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "splitSheetId"          TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "email"                 TEXT NOT NULL,
  "artistId"              TEXT,
  "role"                  TEXT NOT NULL DEFAULT '',
  "percentage"            DOUBLE PRECISION NOT NULL,
  "paystackRecipientCode" TEXT NOT NULL DEFAULT '',
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "split_recipients_splitSheetId_fkey"
    FOREIGN KEY ("splitSheetId") REFERENCES "split_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "split_recipients_splitSheetId_idx"
  ON "split_recipients"("splitSheetId");

CREATE TABLE IF NOT EXISTS "split_disbursements" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "splitSheetId" TEXT NOT NULL,
  "purchaseId"   TEXT,
  "totalGross"   DOUBLE PRECISION NOT NULL,
  "platformFee"  DOUBLE PRECISION NOT NULL,
  "totalNet"     DOUBLE PRECISION NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "processedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "split_disbursements_splitSheetId_fkey"
    FOREIGN KEY ("splitSheetId") REFERENCES "split_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "split_disbursements_splitSheetId_idx"
  ON "split_disbursements"("splitSheetId");
