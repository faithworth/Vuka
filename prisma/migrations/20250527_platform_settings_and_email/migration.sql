-- Combined: platform_settings table (phase5_platform_settings) +
--           email_logs + broadcast_logs tables (phase9_email_system)
-- All idempotent with IF NOT EXISTS

-- ── Platform Settings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id"          TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "value"       JSONB NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"   TEXT NOT NULL DEFAULT '',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_settings_key_key" ON "platform_settings"("key");

-- Seed default settings (safe on conflict)
INSERT INTO "platform_settings" ("id", "key", "value", "description")
VALUES
  (gen_random_uuid()::text, 'min_payout_zar',         '100'::jsonb,   'Minimum payout amount in ZAR'),
  (gen_random_uuid()::text, 'payout_processing_days',  '3'::jsonb,    'SLA days for payout processing'),
  (gen_random_uuid()::text, 'registrations_open',      'true'::jsonb,  'Allow new registrations'),
  (gen_random_uuid()::text, 'distributions_open',      'true'::jsonb,  'Allow new distributions'),
  (gen_random_uuid()::text, 'maintenance_mode',        'false'::jsonb, 'Enable maintenance mode'),
  (gen_random_uuid()::text, 'feature_beat_store',      'true'::jsonb,  'Enable beat store'),
  (gen_random_uuid()::text, 'feature_video_dist',      'false'::jsonb, 'Enable video distribution'),
  (gen_random_uuid()::text, 'feature_fan_tips',        'true'::jsonb,  'Enable fan tips'),
  (gen_random_uuid()::text, 'platform_fee_pct',        '8'::jsonb,     'Global platform fee percentage (0-100)')
ON CONFLICT ("key") DO NOTHING;

-- ── Email Logs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "email_logs" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "to"          TEXT NOT NULL,
  "template"    TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "userId"      TEXT,
  "entityType"  TEXT,
  "entityId"    TEXT,
  "resendId"    TEXT,
  "status"      TEXT NOT NULL DEFAULT 'sent',
  "error"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_logs_userId_idx"    ON "email_logs"("userId");
CREATE INDEX IF NOT EXISTS "email_logs_template_idx"  ON "email_logs"("template");
CREATE INDEX IF NOT EXISTS "email_logs_createdAt_idx" ON "email_logs"("createdAt");

-- ── Broadcast Logs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "broadcast_logs" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "sentBy"         TEXT NOT NULL,
  "subject"        TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "ctaLabel"       TEXT,
  "ctaUrl"         TEXT,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "filter"         JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "broadcast_logs_pkey" PRIMARY KEY ("id")
);
