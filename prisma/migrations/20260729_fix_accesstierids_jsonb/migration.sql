-- Fix: accessTierIds column type mismatch.
--
-- Root cause: phase2_creator_economy created accessTierIds as TEXT[].
-- phase5_exclusive_content tried to re-declare it as JSONB via ADD COLUMN IF NOT EXISTS,
-- which is a no-op when the column already exists — so the column stayed as TEXT[].
-- Meanwhile schema.prisma declares it as Json (JSONB), causing Prisma to send JSONB
-- wire format to a TEXT[] column, producing PostgreSQL error 54000:
-- "number of array dimensions (1528967728) exceeds the maximum allowed (6)"
-- on every ExclusiveContent create or update.
--
-- Applied directly via Supabase on 2026-07-29. This file records it in migration history.

ALTER TABLE "ExclusiveContent"
ALTER COLUMN "accessTierIds" TYPE JSONB USING to_jsonb("accessTierIds");

ALTER TABLE "ExclusiveContent"
ALTER COLUMN "accessTierIds" SET DEFAULT '[]'::jsonb;
