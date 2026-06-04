-- Phase 5: Add PlatformSetting table for admin-configurable platform settings
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

-- Seed default settings
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
  (gen_random_uuid()::text, 'platform_fee_pct',        '8'::jsonb,     'Global platform fee percentage (0–100)')
ON CONFLICT ("key") DO NOTHING;
