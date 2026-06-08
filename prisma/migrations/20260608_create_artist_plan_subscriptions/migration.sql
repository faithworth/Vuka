-- Creates the artist_plan_subscriptions table.
-- This table is defined in schema.prisma (model ArtistPlanSubscription)
-- but was never included in any prior migration file.

CREATE TABLE IF NOT EXISTS "artist_plan_subscriptions" (
  "id"                 TEXT        NOT NULL,
  "artistId"           TEXT        NOT NULL,
  "planSlug"           TEXT        NOT NULL,
  "status"             TEXT        NOT NULL DEFAULT 'active',
  "payfastToken"       TEXT,
  "payfastPaymentId"   TEXT,
  "amount"             DOUBLE PRECISION NOT NULL,
  "currency"           TEXT        NOT NULL DEFAULT 'ZAR',
  "billingInterval"    TEXT        NOT NULL DEFAULT 'monthly',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodEnd"   TIMESTAMP(3) NOT NULL,
  "cancelledAt"        TIMESTAMP(3),
  "failedAt"           TIMESTAMP(3),
  "failReason"         TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "artist_plan_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artist_plan_subscriptions_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "artist_plan_subscriptions_artistId_idx"
  ON "artist_plan_subscriptions"("artistId");

CREATE INDEX IF NOT EXISTS "artist_plan_subscriptions_status_idx"
  ON "artist_plan_subscriptions"("status");
