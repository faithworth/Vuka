-- Phase 9: Email system tracking
-- Tracks sent emails for audit/dedup purposes

CREATE TABLE IF NOT EXISTS "email_logs" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "to"          TEXT NOT NULL,
  "template"    TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "user_id"     TEXT,
  "entity_type" TEXT,
  "entity_id"   TEXT,
  "resend_id"   TEXT,
  "status"      TEXT NOT NULL DEFAULT 'sent',
  "error"       TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_logs_user_id_idx" ON "email_logs"("user_id");
CREATE INDEX IF NOT EXISTS "email_logs_template_idx" ON "email_logs"("template");
CREATE INDEX IF NOT EXISTS "email_logs_created_at_idx" ON "email_logs"("created_at");

-- Admin broadcast log
CREATE TABLE IF NOT EXISTS "broadcast_logs" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "sent_by"       TEXT NOT NULL,
  "subject"       TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "cta_label"     TEXT,
  "cta_url"       TEXT,
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "filter"        JSONB,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "broadcast_logs_pkey" PRIMARY KEY ("id")
);
