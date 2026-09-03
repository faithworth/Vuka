-- Merch: flat per-item shipping fee set by the artist
ALTER TABLE "Merch" ADD COLUMN IF NOT EXISTS "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Purchase: shipping address capture + artist-fulfilled tracking for merch orders
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingAddress" JSONB;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "fulfillmentStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "trackingRef" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3);
