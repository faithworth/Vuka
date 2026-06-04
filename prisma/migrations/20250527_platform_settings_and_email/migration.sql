-- Combined: platform_settings table + fix email_logs/broadcast_logs column names
-- phase9_email_system created these tables with snake_case columns.
-- Prisma schema uses camelCase field names (no @map on individual fields),
-- so we rename the columns here. All operations are idempotent.

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

INSERT INTO "platform_settings" ("id", "key", "value", "description")
VALUES
  (gen_random_uuid()::text, 'min_payout_zar',        '100'::jsonb,   'Minimum payout amount in ZAR'),
  (gen_random_uuid()::text, 'payout_processing_days', '3'::jsonb,    'SLA days for payout processing'),
  (gen_random_uuid()::text, 'registrations_open',     'true'::jsonb,  'Allow new registrations'),
  (gen_random_uuid()::text, 'distributions_open',     'true'::jsonb,  'Allow new distributions'),
  (gen_random_uuid()::text, 'maintenance_mode',       'false'::jsonb, 'Enable maintenance mode'),
  (gen_random_uuid()::text, 'feature_beat_store',     'true'::jsonb,  'Enable beat store'),
  (gen_random_uuid()::text, 'feature_video_dist',     'false'::jsonb, 'Enable video distribution'),
  (gen_random_uuid()::text, 'feature_fan_tips',       'true'::jsonb,  'Enable fan tips'),
  (gen_random_uuid()::text, 'platform_fee_pct',       '8'::jsonb,     'Global platform fee percentage (0-100)')
ON CONFLICT ("key") DO NOTHING;

-- ── email_logs: create with camelCase for fresh DBs, then rename for existing ──

-- Step 1: create if it doesn't exist yet (fresh DB — camelCase from the start)
CREATE TABLE IF NOT EXISTS "email_logs" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "to"         TEXT NOT NULL,
  "template"   TEXT NOT NULL,
  "subject"    TEXT NOT NULL,
  "userId"     TEXT,
  "entityType" TEXT,
  "entityId"   TEXT,
  "resendId"   TEXT,
  "status"     TEXT NOT NULL DEFAULT 'sent',
  "error"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- Step 2: rename snake_case columns to camelCase (only if they still exist from phase9)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_logs' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE "email_logs" RENAME COLUMN "user_id"     TO "userId";
    ALTER TABLE "email_logs" RENAME COLUMN "entity_type" TO "entityType";
    ALTER TABLE "email_logs" RENAME COLUMN "entity_id"   TO "entityId";
    ALTER TABLE "email_logs" RENAME COLUMN "resend_id"   TO "resendId";
    ALTER TABLE "email_logs" RENAME COLUMN "created_at"  TO "createdAt";
  END IF;
END $$;

-- Step 3: drop stale snake_case indexes, create correct camelCase ones
DROP INDEX IF EXISTS "email_logs_user_id_idx";
DROP INDEX IF EXISTS "email_logs_created_at_idx";
CREATE INDEX IF NOT EXISTS "email_logs_userId_idx"    ON "email_logs"("userId");
CREATE INDEX IF NOT EXISTS "email_logs_template_idx"  ON "email_logs"("template");
CREATE INDEX IF NOT EXISTS "email_logs_createdAt_idx" ON "email_logs"("createdAt");

-- ── broadcast_logs: same pattern ──────────────────────────────────────────

-- Step 1: create if it doesn't exist yet (fresh DB)
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

-- Step 2: rename snake_case columns to camelCase (only if they still exist from phase9)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'broadcast_logs' AND column_name = 'sent_by'
  ) THEN
    ALTER TABLE "broadcast_logs" RENAME COLUMN "sent_by"         TO "sentBy";
    ALTER TABLE "broadcast_logs" RENAME COLUMN "cta_label"       TO "ctaLabel";
    ALTER TABLE "broadcast_logs" RENAME COLUMN "cta_url"         TO "ctaUrl";
    ALTER TABLE "broadcast_logs" RENAME COLUMN "recipient_count" TO "recipientCount";
    ALTER TABLE "broadcast_logs" RENAME COLUMN "created_at"      TO "createdAt";
  END IF;
END $$;
