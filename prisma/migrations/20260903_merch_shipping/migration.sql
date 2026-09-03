-- Merch: flat per-item shipping fee, set by the artist at listing time.
-- Excluded from platform commission — only Merch.price is commissioned.
ALTER TABLE "Merch" ADD COLUMN "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Purchase: shipping + fulfilment fields, populated only for itemType='merch'.
-- shippingAddress is JSON (name, line1, line2, city, province, postalCode,
-- phone, country) to match the existing Invoice.buyerAddress JSON pattern
-- rather than adding 7+ new flat columns.
ALTER TABLE "Purchase" ADD COLUMN "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN "shippingAddress" JSONB;
ALTER TABLE "Purchase" ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Purchase" ADD COLUMN "trackingCarrier" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Purchase" ADD COLUMN "trackingRef" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Purchase" ADD COLUMN "shippedAt" TIMESTAMP(3);

CREATE INDEX "Purchase_fulfillmentStatus_idx" ON "Purchase"("fulfillmentStatus");
