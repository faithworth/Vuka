-- Migration: Add ISRC to Track and UPC to Release
-- Run with: npx prisma db execute --file prisma/migrations/add_isrc_upc.sql --schema prisma/schema.prisma
-- OR add to your next Prisma migration

ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "isrc" TEXT DEFAULT NULL;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "upc" TEXT DEFAULT NULL;
