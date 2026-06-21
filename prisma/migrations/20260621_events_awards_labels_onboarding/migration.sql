-- Migration: Events, Awards, Labels, Fan Referrals, Artist Onboarding
-- Generated: 2026-06-21

-- ── EVENTS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "events" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "artistId"    TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "venue"       TEXT NOT NULL DEFAULT '',
  "city"        TEXT NOT NULL DEFAULT '',
  "province"    TEXT NOT NULL DEFAULT '',
  "startDate"   TIMESTAMP(3) NOT NULL,
  "endDate"     TIMESTAMP(3),
  "coverUrl"    TEXT NOT NULL DEFAULT '',
  "status"      TEXT NOT NULL DEFAULT 'draft',
  "slug"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "events_slug_key" ON "events"("slug");
CREATE INDEX IF NOT EXISTS "events_artistId_status_idx" ON "events"("artistId","status");

CREATE TABLE IF NOT EXISTS "event_tickets" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "eventId"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "price"       DOUBLE PRECISION NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'ZAR',
  "quantity"    INTEGER,
  "sold"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "event_tickets_eventId_idx" ON "event_tickets"("eventId");

CREATE TABLE IF NOT EXISTS "ticket_purchases" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "eventId"           TEXT NOT NULL,
  "ticketId"          TEXT NOT NULL,
  "userId"            TEXT,
  "buyerName"         TEXT NOT NULL,
  "buyerEmail"        TEXT NOT NULL,
  "quantity"          INTEGER NOT NULL DEFAULT 1,
  "unitPrice"         DOUBLE PRECISION NOT NULL,
  "totalAmount"       DOUBLE PRECISION NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'ZAR',
  "paystackReference" TEXT,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "qrToken"           TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_purchases_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id"),
  CONSTRAINT "ticket_purchases_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_purchases_qrToken_key" ON "ticket_purchases"("qrToken");
CREATE INDEX IF NOT EXISTS "ticket_purchases_eventId_status_idx" ON "ticket_purchases"("eventId","status");
CREATE INDEX IF NOT EXISTS "ticket_purchases_buyerEmail_idx" ON "ticket_purchases"("buyerEmail");

-- ── AWARDS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "awards" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "year"        INTEGER NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "coverUrl"    TEXT NOT NULL DEFAULT '',
  "status"      TEXT NOT NULL DEFAULT 'nominations_open',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "award_categories" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "awardId"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "award_categories_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "awards"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "award_categories_awardId_idx" ON "award_categories"("awardId");

CREATE TABLE IF NOT EXISTS "award_nominations" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "categoryId"     TEXT NOT NULL,
  "artistId"       TEXT NOT NULL,
  "releaseId"      TEXT,
  "voteCount"      INTEGER NOT NULL DEFAULT 0,
  "analyticsScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "finalScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isWinner"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "award_nominations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "award_categories"("id") ON DELETE CASCADE,
  CONSTRAINT "award_nominations_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "award_nominations_categoryId_artistId_key" ON "award_nominations"("categoryId","artistId");
CREATE INDEX IF NOT EXISTS "award_nominations_categoryId_idx" ON "award_nominations"("categoryId");

CREATE TABLE IF NOT EXISTS "award_votes" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "nominationId" TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "award_votes_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "award_nominations"("id") ON DELETE CASCADE,
  CONSTRAINT "award_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "award_votes_nominationId_userId_key" ON "award_votes"("nominationId","userId");
CREATE INDEX IF NOT EXISTS "award_votes_nominationId_idx" ON "award_votes"("nominationId");

-- ── LABELS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "labels" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "logoUrl"     TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "website"     TEXT NOT NULL DEFAULT '',
  "ownerId"     TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "labels_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "labels_slug_key" ON "labels"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "labels_ownerId_key" ON "labels"("ownerId");

CREATE TABLE IF NOT EXISTS "label_artists" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "labelId"      TEXT NOT NULL,
  "artistId"     TEXT NOT NULL,
  "revenueShare" DOUBLE PRECISION NOT NULL DEFAULT 80,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "inviteToken"  TEXT NOT NULL,
  "joinedAt"     TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "label_artists_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE,
  CONSTRAINT "label_artists_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "label_artists_labelId_artistId_key" ON "label_artists"("labelId","artistId");
CREATE UNIQUE INDEX IF NOT EXISTS "label_artists_inviteToken_key" ON "label_artists"("inviteToken");
CREATE INDEX IF NOT EXISTS "label_artists_labelId_idx" ON "label_artists"("labelId");

CREATE TABLE IF NOT EXISTS "label_team_members" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "labelId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "role"      TEXT NOT NULL DEFAULT 'manager',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "label_team_members_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE,
  CONSTRAINT "label_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "label_team_members_labelId_userId_key" ON "label_team_members"("labelId","userId");
CREATE INDEX IF NOT EXISTS "label_team_members_labelId_idx" ON "label_team_members"("labelId");

-- ── FAN REFERRALS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fan_referrals" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "referrerId"  TEXT NOT NULL,
  "refereeId"   TEXT NOT NULL,
  "artistId"    TEXT,
  "purchaseId"  TEXT,
  "rewardType"  TEXT NOT NULL DEFAULT 'account_credit',
  "rewardValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rewarded"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fan_referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id"),
  CONSTRAINT "fan_referrals_refereeId_fkey"  FOREIGN KEY ("refereeId")  REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "fan_referrals_referrerId_refereeId_key" ON "fan_referrals"("referrerId","refereeId");

-- ── ARTIST ONBOARDING ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "artist_onboarding" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "artistId"       TEXT NOT NULL,
  "hasProfile"     BOOLEAN NOT NULL DEFAULT false,
  "hasRelease"     BOOLEAN NOT NULL DEFAULT false,
  "hasBankAccount" BOOLEAN NOT NULL DEFAULT false,
  "hasSocials"     BOOLEAN NOT NULL DEFAULT false,
  "dismissedAt"    TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_onboarding_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "artist_onboarding_artistId_key" ON "artist_onboarding"("artistId");
