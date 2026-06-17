-- Phase 10b — Add paystackRecipient to Artist
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "paystackRecipient" TEXT;
