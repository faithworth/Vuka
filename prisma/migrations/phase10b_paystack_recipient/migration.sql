-- Phase 10b — Add paystackRecipient to Artist
ALTER TABLE "artists" ADD COLUMN IF NOT EXISTS "paystackRecipient" TEXT;
