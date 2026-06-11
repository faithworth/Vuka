-- Add totalOrders counter to MarketplaceService
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MarketplaceService' AND column_name = 'totalOrders'
  ) THEN
    ALTER TABLE "MarketplaceService" ADD COLUMN "totalOrders" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
