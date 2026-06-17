-- ============================================================
-- Phase 10 — 2FA · Device Sessions · Password Reset
-- ============================================================

CREATE TABLE IF NOT EXISTS "user_two_factor" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"      TEXT        NOT NULL,
  "secret"      TEXT        NOT NULL,
  "backupCodes" TEXT        NOT NULL DEFAULT '[]',
  "isEnabled"   BOOLEAN     NOT NULL DEFAULT false,
  "enabledAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "user_two_factor_pkey"    PRIMARY KEY ("id"),
  CONSTRAINT "user_two_factor_userId_key" UNIQUE ("userId")
);

CREATE TABLE IF NOT EXISTS "user_device_sessions" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"      TEXT        NOT NULL,
  "sessionId"   TEXT        NOT NULL,
  "deviceName"  TEXT        NOT NULL DEFAULT 'Unknown Device',
  "browser"     TEXT        NOT NULL DEFAULT '',
  "os"          TEXT        NOT NULL DEFAULT '',
  "ipAddress"   TEXT        NOT NULL DEFAULT '',
  "isCurrent"   BOOLEAN     NOT NULL DEFAULT false,
  "isRevoked"   BOOLEAN     NOT NULL DEFAULT false,
  "revokedAt"   TIMESTAMPTZ,
  "lastSeenAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "user_device_sessions_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "user_device_sessions_sid_key"   UNIQUE ("sessionId")
);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT        NOT NULL,
  "email"     TEXT        NOT NULL,
  "token"     TEXT        NOT NULL,
  "usedAt"    TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "password_reset_tokens_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_token_key" UNIQUE ("token")
);

CREATE TABLE IF NOT EXISTS "two_factor_challenges" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT        NOT NULL,
  "token"     TEXT        NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt"    TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "two_factor_challenges_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "two_factor_challenges_token_key" UNIQUE ("token")
);

CREATE INDEX IF NOT EXISTS "uds_userId_idx"  ON "user_device_sessions"("userId");
CREATE INDEX IF NOT EXISTS "prt_email_idx"   ON "password_reset_tokens"("email");
CREATE INDEX IF NOT EXISTS "tfc_userId_idx"  ON "two_factor_challenges"("userId");
