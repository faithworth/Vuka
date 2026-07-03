-- Phase 13: Ticket gate security
-- Restores the anti-fraud columns for event check-in that were missing
-- from ticket_purchases. Fully additive/non-destructive:
--   - qrSignature defaults to '' for any pre-existing row (none should
--     exist as "confirmed" without going through the app's checkout flow
--     first, but this keeps the migration safe regardless).
--   - checkedInAt / checkedInByUserId / checkInDeviceInfo are nullable/
--     defaulted, so existing rows are simply "not checked in yet".
ALTER TABLE "ticket_purchases"
  ADD COLUMN IF NOT EXISTS "qrSignature"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "checkedInAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkedInByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkInDeviceInfo" TEXT NOT NULL DEFAULT '';
