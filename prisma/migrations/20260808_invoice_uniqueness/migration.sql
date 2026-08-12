-- Prevent duplicate invoices for the same purchase/order under concurrent
-- requests. Postgres UNIQUE constraints permit multiple NULLs while still
-- enforcing uniqueness among non-null values, so no partial-index WHERE
-- clause is needed: NULL purchaseId (order-based invoices) and NULL orderId
-- (purchase-based invoices) remain unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_purchaseId_key" ON "Invoice"("purchaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_orderId_key" ON "Invoice"("orderId");
