-- Repair legacy database drift: some production databases still have a required
-- IndustryUser.referralCode column that is no longer represented in Prisma.
-- Give legacy rows a unique-safe generated value so profile creation can succeed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'IndustryUser'
      AND column_name = 'referralCode'
  ) THEN
    ALTER TABLE "IndustryUser"
      ALTER COLUMN "referralCode"
      SET DEFAULT (md5(random()::text || clock_timestamp()::text));
  END IF;
END $$;
