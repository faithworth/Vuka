-- 20260612_paystack_migration
-- Renames PayFast columns to Paystack equivalents.
-- All idempotent — safe to re-run.

-- Purchase: payfastPfPaymentId → paystackReference
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Purchase' AND column_name='payfastPfPaymentId') THEN
    ALTER TABLE "Purchase" RENAME COLUMN "payfastPfPaymentId" TO "paystackReference";
  END IF;
END $$;

-- SupportTxn: payfastPaymentId → paystackReference
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SupportTxn' AND column_name='payfastPaymentId') THEN
    ALTER TABLE "SupportTxn" RENAME COLUMN "payfastPaymentId" TO "paystackReference";
  END IF;
END $$;

-- ArtistPlanSubscription: payfastPaymentId → paystackReference
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ArtistPlanSubscription' AND column_name='payfastPaymentId') THEN
    ALTER TABLE "ArtistPlanSubscription" RENAME COLUMN "payfastPaymentId" TO "paystackReference";
  END IF;
END $$;

-- ArtistPlanSubscription: payfastToken → paystackToken
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ArtistPlanSubscription' AND column_name='payfastToken') THEN
    ALTER TABLE "ArtistPlanSubscription" RENAME COLUMN "payfastToken" TO "paystackToken";
  END IF;
END $$;

-- Artist: payfastMerchant → paystackRecipient
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Artist' AND column_name='payfastMerchant') THEN
    ALTER TABLE "Artist" RENAME COLUMN "payfastMerchant" TO "paystackRecipient";
  END IF;
END $$;

-- ArtistBankAccount: payfastMerchantId → paystackAccountCode
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ArtistBankAccount' AND column_name='payfastMerchantId') THEN
    ALTER TABLE "ArtistBankAccount" RENAME COLUMN "payfastMerchantId" TO "paystackAccountCode";
  END IF;
END $$;

-- Indexes for fast webhook lookups by reference
CREATE INDEX IF NOT EXISTS "Purchase_paystackReference_idx"       ON "Purchase"("paystackReference");
CREATE INDEX IF NOT EXISTS "SupportTxn_paystackReference_idx"     ON "SupportTxn"("paystackReference");
CREATE INDEX IF NOT EXISTS "ArtistPlanSub_paystackRef_idx"        ON "ArtistPlanSubscription"("paystackReference");
