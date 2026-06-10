-- Migration: Industry Service Payment Orders
-- Adds IndustryServiceOrder table so artists can pay industry professionals
-- through Vuka (10% platform fee charged to industry, paid immediately via PayFast).

CREATE TABLE IF NOT EXISTS "IndustryServiceOrder" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "serviceId"      TEXT NOT NULL,
  "artistId"       TEXT NOT NULL,
  "industryUserId" TEXT NOT NULL,
  "amount"         FLOAT NOT NULL,
  "platformFee"    FLOAT NOT NULL DEFAULT 0,
  "netAmount"      FLOAT NOT NULL DEFAULT 0,
  "currency"       TEXT NOT NULL DEFAULT 'ZAR',
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "requirements"   TEXT NOT NULL DEFAULT '',
  "payfastPaymentId" TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IndustryServiceOrder_serviceId_fkey') THEN
    ALTER TABLE "IndustryServiceOrder"
      ADD CONSTRAINT "IndustryServiceOrder_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "IndustryService"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IndustryServiceOrder_artistId_fkey') THEN
    ALTER TABLE "IndustryServiceOrder"
      ADD CONSTRAINT "IndustryServiceOrder_artistId_fkey"
      FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IndustryServiceOrder_industryUserId_fkey') THEN
    ALTER TABLE "IndustryServiceOrder"
      ADD CONSTRAINT "IndustryServiceOrder_industryUserId_fkey"
      FOREIGN KEY ("industryUserId") REFERENCES "IndustryUser"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IndustryServiceOrder_artistId_idx" ON "IndustryServiceOrder" ("artistId");
CREATE INDEX IF NOT EXISTS "IndustryServiceOrder_industryUserId_idx" ON "IndustryServiceOrder" ("industryUserId");
CREATE INDEX IF NOT EXISTS "IndustryServiceOrder_status_idx" ON "IndustryServiceOrder" ("status");

-- Add IndustryServiceOrder to Prisma schema (tracked model)
-- Add openToOffers flag on Artist so industry can filter
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "openToOffers" BOOLEAN NOT NULL DEFAULT true;

-- Add payout record for industry earnings tracking
-- industryOrderId links ArtistPayout to an IndustryServiceOrder
ALTER TABLE "ArtistPayout" ADD COLUMN IF NOT EXISTS "industryOrderId" TEXT;
