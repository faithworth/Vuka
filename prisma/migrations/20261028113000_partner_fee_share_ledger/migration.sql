-- Partner fee-share profiles, monthly statements, and payout history.
-- All monetary history is additive; this migration does not delete or rewrite existing payments.
CREATE TABLE IF NOT EXISTS "partner_profiles" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "referralCode" TEXT NOT NULL,
  "baseRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "currentRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "paypalEmail" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_profiles_userId_key" ON "partner_profiles"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "partner_profiles_referralCode_key" ON "partner_profiles"("referralCode");
CREATE INDEX IF NOT EXISTS "partner_profiles_isActive_idx" ON "partner_profiles"("isActive");
DO $$ BEGIN
  ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "partner_monthly_statements" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "grossPlatformFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "knownProcessorFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netPlatformFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unknownProcessorFeeRows" INTEGER NOT NULL DEFAULT 0,
  "shareRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "shareAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qualifyingCreators" INTEGER NOT NULL DEFAULT 0,
  "categoryBreakdown" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "notes" TEXT NOT NULL DEFAULT '',
  "issuedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_monthly_statements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_monthly_statements_partnerId_periodStart_key"
  ON "partner_monthly_statements"("partnerId","periodStart");
CREATE INDEX IF NOT EXISTS "partner_monthly_statements_periodStart_status_idx"
  ON "partner_monthly_statements"("periodStart","status");
DO $$ BEGIN
  ALTER TABLE "partner_monthly_statements" ADD CONSTRAINT "partner_monthly_statements_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "partner_payouts" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "statementId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ZAR',
  "method" TEXT NOT NULL DEFAULT 'paypal',
  "destination" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reference" TEXT NOT NULL DEFAULT '',
  "adminNotes" TEXT NOT NULL DEFAULT '',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_payouts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "partner_payouts_partnerId_status_idx" ON "partner_payouts"("partnerId","status");
CREATE INDEX IF NOT EXISTS "partner_payouts_statementId_idx" ON "partner_payouts"("statementId");
DO $$ BEGIN
  ALTER TABLE "partner_payouts" ADD CONSTRAINT "partner_payouts_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "partner_payouts" ADD CONSTRAINT "partner_payouts_statementId_fkey"
    FOREIGN KEY ("statementId") REFERENCES "partner_monthly_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;