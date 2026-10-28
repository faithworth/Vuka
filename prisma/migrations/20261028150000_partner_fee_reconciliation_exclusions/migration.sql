-- Follow-up additive migration. Earlier partner/revenue migrations are already applied
-- in the connected database and must remain immutable.
ALTER TABLE "MarketplaceOrder"
  ADD COLUMN IF NOT EXISTS "processorFee" DOUBLE PRECISION;
ALTER TABLE "IndustryServiceOrder"
  ADD COLUMN IF NOT EXISTS "processorFee" DOUBLE PRECISION;
ALTER TABLE "partner_monthly_statements"
  ADD COLUMN IF NOT EXISTS "unknownPlatformFeeRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "partner_creator_milestones"
  ADD COLUMN IF NOT EXISTS "history" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "User_referredBy_idx" ON "User"("referredBy");

CREATE TABLE IF NOT EXISTS "partner_creator_milestones" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "highestCategory" TEXT NOT NULL DEFAULT 'none',
  "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qualifiedAt" TIMESTAMP(3),
  "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_creator_milestones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_creator_milestones_partnerId_referredUserId_key"
  ON "partner_creator_milestones"("partnerId", "referredUserId");
CREATE INDEX IF NOT EXISTS "partner_creator_milestones_referredUserId_idx"
  ON "partner_creator_milestones"("referredUserId");
DO $ BEGIN
  ALTER TABLE "partner_creator_milestones" ADD CONSTRAINT "partner_creator_milestones_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $;
DO $ BEGIN
  ALTER TABLE "partner_creator_milestones" ADD CONSTRAINT "partner_creator_milestones_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $;

CREATE TABLE IF NOT EXISTS "partner_creator_exclusions" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_creator_exclusions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_creator_exclusions_partnerId_referredUserId_key"
  ON "partner_creator_exclusions"("partnerId", "referredUserId");
CREATE INDEX IF NOT EXISTS "partner_creator_exclusions_referredUserId_idx"
  ON "partner_creator_exclusions"("referredUserId");

DO $$ BEGIN
  ALTER TABLE "partner_creator_exclusions" ADD CONSTRAINT "partner_creator_exclusions_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "partner_creator_exclusions" ADD CONSTRAINT "partner_creator_exclusions_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "partner_creator_exclusions" ADD CONSTRAINT "partner_creator_exclusions_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
