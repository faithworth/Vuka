-- Fix: ArtistBankAccount was missing updatedAt column
-- This caused "Null constraint violation on updatedAt" on every insert
ALTER TABLE "ArtistBankAccount" 
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
