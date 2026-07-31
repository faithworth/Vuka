-- Add LoyaltyStamp table (applied directly 2026-07-31)
CREATE TABLE IF NOT EXISTS "LoyaltyStamp" (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"     TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "artistId"   TEXT NOT NULL REFERENCES "Artist"(id) ON DELETE CASCADE,
  "purchaseId" TEXT REFERENCES "Purchase"(id) ON DELETE SET NULL,
  "stampCount" INTEGER NOT NULL DEFAULT 1,
  "discountPct" FLOAT NOT NULL DEFAULT 0,
  "discountActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyStamp_userId_artistId_key" ON "LoyaltyStamp"("userId","artistId");
CREATE INDEX IF NOT EXISTS "LoyaltyStamp_artistId_idx" ON "LoyaltyStamp"("artistId");
CREATE INDEX IF NOT EXISTS "LoyaltyStamp_userId_idx" ON "LoyaltyStamp"("userId");
