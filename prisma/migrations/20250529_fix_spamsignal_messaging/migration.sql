-- Migration: 20250529_fix_spamsignal_messaging
-- Add isFlagged to SpamSignal

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'SpamSignal') THEN
    ALTER TABLE "SpamSignal" ADD COLUMN IF NOT EXISTS "isFlagged" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
