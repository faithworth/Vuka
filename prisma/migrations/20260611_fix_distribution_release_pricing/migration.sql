-- Add price, minPrice, payWhatYouWant to DistributionRelease
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'DistributionRelease' AND column_name = 'price'
  ) THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "price" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'DistributionRelease' AND column_name = 'minPrice'
  ) THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "minPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'DistributionRelease' AND column_name = 'payWhatYouWant'
  ) THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "payWhatYouWant" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
