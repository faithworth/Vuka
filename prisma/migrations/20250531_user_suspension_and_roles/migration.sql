-- Migration: 20250531_user_suspension_and_roles
-- Adds isSuspended, suspendedAt, suspendedReason to User.
-- These fields are referenced in src/app/api/auth/me/route.ts and the
-- admin suspension system. All statements are idempotent — safe to re-run.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSuspended"     BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt"     TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT        NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "User_isSuspended_idx" ON "User" ("isSuspended") WHERE "isSuspended" = TRUE;
