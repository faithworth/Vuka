-- Industry payout flow.
--
-- Part 1 fixes a live bug: src/lib/webhooks/paystack-handlers.ts
-- (handleIndustryOrderEvent) already does
--   UPDATE "IndustryUser" SET "totalEarnings" = "totalEarnings" + $1
-- but no migration ever added this column, and it was never added to
-- prisma/schema.prisma either. Every real industry-service payment
-- webhook has been throwing "column totalEarnings does not exist" and
-- failing silently (caught by the handler's try/catch, logged, no money
-- actually credited). This adds the column so that write finally lands.
--
-- Part 2 builds the withdrawal side, which never existed at all:
-- IndustryBankAccount + IndustryPayoutRequest, mirroring
-- ArtistBankAccount + PayoutRequest (48h eligibility cooldown, encrypted
-- account number, masked display, verification flag).

ALTER TABLE "IndustryUser" ADD COLUMN IF NOT EXISTS "totalEarnings"  FLOAT NOT NULL DEFAULT 0;
ALTER TABLE "IndustryUser" ADD COLUMN IF NOT EXISTS "totalWithdrawn" FLOAT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "IndustryBankAccount" (
  "id"                  TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "industryUserId"      TEXT NOT NULL,
  "bankName"            TEXT NOT NULL DEFAULT '',
  "accountHolder"       TEXT NOT NULL DEFAULT '',
  "accountNumber"       TEXT NOT NULL DEFAULT '',  -- encrypted at rest, same as ArtistBankAccount
  "maskedNumber"        TEXT NOT NULL DEFAULT '',
  "branchCode"          TEXT NOT NULL DEFAULT '',
  "accountType"         TEXT NOT NULL DEFAULT 'current',
  "paypalEmail"         TEXT,
  "paystackAccountCode" TEXT,
  "isDefault"           BOOLEAN NOT NULL DEFAULT false,
  "isVerified"          BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt"          TIMESTAMPTZ,
  "verificationMethod"  TEXT NOT NULL DEFAULT '',
  "eligibleForPayoutAt" TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IndustryBankAccount_industryUserId_fkey') THEN
    ALTER TABLE "IndustryBankAccount"
      ADD CONSTRAINT "IndustryBankAccount_industryUserId_fkey"
      FOREIGN KEY ("industryUserId") REFERENCES "IndustryUser"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IndustryBankAccount_industryUserId_idx" ON "IndustryBankAccount" ("industryUserId");

CREATE TABLE IF NOT EXISTS "IndustryPayoutRequest" (
  "id"                TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "industryUserId"    TEXT NOT NULL,
  "amount"            FLOAT NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'ZAR',
  "bankAccountId"     TEXT,
  "status"            TEXT NOT NULL DEFAULT 'pending', -- pending, approved, processing, paid, rejected
  "method"            TEXT NOT NULL DEFAULT 'bank_transfer',
  "paypalEmail"       TEXT,
  "paystackReference" TEXT,
  "adminNotes"        TEXT NOT NULL DEFAULT '',
  "notes"             TEXT NOT NULL DEFAULT '',
  "approvedAt"        TIMESTAMPTZ,
  "processedAt"       TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IndustryPayoutRequest_industryUserId_fkey') THEN
    ALTER TABLE "IndustryPayoutRequest"
      ADD CONSTRAINT "IndustryPayoutRequest_industryUserId_fkey"
      FOREIGN KEY ("industryUserId") REFERENCES "IndustryUser"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IndustryPayoutRequest_bankAccountId_fkey') THEN
    ALTER TABLE "IndustryPayoutRequest"
      ADD CONSTRAINT "IndustryPayoutRequest_bankAccountId_fkey"
      FOREIGN KEY ("bankAccountId") REFERENCES "IndustryBankAccount"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IndustryPayoutRequest_industryUserId_status_idx" ON "IndustryPayoutRequest" ("industryUserId", "status");
CREATE INDEX IF NOT EXISTS "IndustryPayoutRequest_status_idx" ON "IndustryPayoutRequest" ("status");
