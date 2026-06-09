-- ============================================================
-- Fix: Missing columns confirmed by Vercel production logs
--
-- Error 1: The column `PayoutRequest.bankAccountId` does not exist
--   → PayoutRequest was originally created without a bankAccountId FK.
--     The schema now defines it as an optional relation to ArtistBankAccount.
--
-- Error 2: The column `ArtistPayout.reference` does not exist
--   → ArtistPayout was created without reference, notes, currency,
--     method, or purchaseId. The schema now defines all of them.
--
-- All ALTER TABLE … ADD COLUMN IF NOT EXISTS so this is safe to re-run.
-- ============================================================

-- ── PayoutRequest: add bankAccountId FK + schema-aligned columns ────────────
ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "currency"      TEXT NOT NULL DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS "adminNotes"    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "processedAt"   TIMESTAMP(3);

-- Wire up the FK to ArtistBankAccount (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PayoutRequest_bankAccountId_fkey'
      AND table_name = 'PayoutRequest'
  ) THEN
    ALTER TABLE "PayoutRequest"
      ADD CONSTRAINT "PayoutRequest_bankAccountId_fkey"
      FOREIGN KEY ("bankAccountId")
      REFERENCES "ArtistBankAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── ArtistPayout: add all columns missing from original CREATE TABLE ─────────
ALTER TABLE "ArtistPayout"
  ADD COLUMN IF NOT EXISTS "currency"     TEXT NOT NULL DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS "method"       TEXT NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS "reference"    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "purchaseId"   TEXT,
  ADD COLUMN IF NOT EXISTS "notes"        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "processedAt"  TIMESTAMP(3);

-- Composite index used by Prisma schema (@@index([artistId, status]))
CREATE INDEX IF NOT EXISTS "ArtistPayout_artistId_status_idx"
  ON "ArtistPayout" ("artistId", "status");

-- Composite index used by Prisma schema (@@index([artistId, status]))
CREATE INDEX IF NOT EXISTS "PayoutRequest_artistId_status_idx"
  ON "PayoutRequest" ("artistId", "status");
