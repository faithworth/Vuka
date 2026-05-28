-- ArtistBankAccount: add PayPal and PayFast payout destination fields
ALTER TABLE "ArtistBankAccount" ADD COLUMN IF NOT EXISTS "paypalEmail"       TEXT;
ALTER TABLE "ArtistBankAccount" ADD COLUMN IF NOT EXISTS "payfastMerchantId" TEXT;

-- Make existing required columns nullable so non-bank account types don't need them
ALTER TABLE "ArtistBankAccount" ALTER COLUMN "bankName"      DROP NOT NULL;
ALTER TABLE "ArtistBankAccount" ALTER COLUMN "accountHolder" DROP NOT NULL;
ALTER TABLE "ArtistBankAccount" ALTER COLUMN "accountNumber" DROP NOT NULL;
ALTER TABLE "ArtistBankAccount" ALTER COLUMN "branchCode"    DROP NOT NULL;

-- Set defaults for any existing rows
UPDATE "ArtistBankAccount" SET "bankName"      = '' WHERE "bankName"      IS NULL;
UPDATE "ArtistBankAccount" SET "accountHolder" = '' WHERE "accountHolder" IS NULL;
UPDATE "ArtistBankAccount" SET "accountNumber" = '' WHERE "accountNumber" IS NULL;
UPDATE "ArtistBankAccount" SET "branchCode"    = '' WHERE "branchCode"    IS NULL;
