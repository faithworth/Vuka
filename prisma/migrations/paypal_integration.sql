-- ============================================================
-- Vuka Migration: PayPal Integration + Distribution Removal
-- ============================================================
-- Run via: /api/migrate (existing migration endpoint)
-- Idempotent: all changes use IF NOT EXISTS / IF EXISTS guards
-- ============================================================

-- ── 1. Purchase: add PayPal payment tracking fields ──────────────────────

-- Payment provider that processed this purchase (paystack | paypal)
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT NOT NULL DEFAULT 'paystack';

-- Currency the buyer actually paid in (ZAR for Paystack, USD for PayPal)
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "paymentCurrency" TEXT NOT NULL DEFAULT 'ZAR';

-- Amount in the payment currency (may differ from amount which is always ZAR)
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "paymentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- artistEarnings: net amount owed to artist after platform fee
-- (replaces the ambiguous netAmount field for clarity)
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "artistEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ── 2. Purchase: drop distributionRelease FK ─────────────────────────────
-- Vuka does not distribute to DSPs. This relation is obsolete.

ALTER TABLE "Purchase"
  DROP COLUMN IF EXISTS "distributionReleaseId";

DROP INDEX IF EXISTS "Purchase_distributionReleaseId_idx";

-- ── 3. PayoutRequest: add PayPal and method fields ───────────────────────

-- Payment method for this payout request
ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "method" TEXT NOT NULL DEFAULT 'bank_transfer';

-- For PayPal payouts — recipient's PayPal email
ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "paypalEmail" TEXT;

-- Admin notes on the payout (rejection reason, processing notes, etc.)
ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';

-- External reference (Paystack transfer code or PayPal batch ID)
ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "paystackReference" TEXT;

-- ── 4. Artist: add paypalEmail at the artist level ───────────────────────
-- Artists can set their preferred PayPal email for international payouts
-- without needing to create a bank account record.

ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "paypalEmail" TEXT;

-- ── 5. ArtistPayout: clean up method values ──────────────────────────────
-- Replace any existing 'flutterwave' method value with 'bank_transfer'
-- Flutterwave has been removed from the platform.

UPDATE "ArtistPayout"
  SET "method" = 'bank_transfer'
  WHERE "method" = 'flutterwave';

-- ── 6. Artist: remove distributionReleases relation ─────────────────────
-- The DistributionRelease model is obsolete — kept in DB for now to avoid
-- data loss; we will drop it in a future migration after confirming no
-- references remain. If you want to drop it now:
--
--   DROP TABLE IF EXISTS "DistributionTrack" CASCADE;
--   DROP TABLE IF EXISTS "DistributionRelease" CASCADE;
--   ALTER TABLE "Artist" DROP COLUMN IF EXISTS "distributionReleases"; -- handled by cascade
--
-- NOTE: Leave the table intact for now. The application no longer reads or
-- writes to it. A future migration will archive and drop it.

-- ── 7. Indexes: add PayPal-relevant indexes ───────────────────────────────

CREATE INDEX IF NOT EXISTS "Purchase_paymentProvider_idx"
  ON "Purchase"("paymentProvider");

CREATE INDEX IF NOT EXISTS "Purchase_paymentCurrency_idx"
  ON "Purchase"("paymentCurrency");

CREATE INDEX IF NOT EXISTS "PayoutRequest_method_idx"
  ON "PayoutRequest"("method");

CREATE INDEX IF NOT EXISTS "PayoutRequest_status_idx"
  ON "PayoutRequest"("status");
