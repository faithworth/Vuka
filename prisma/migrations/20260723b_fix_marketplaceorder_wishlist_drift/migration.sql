-- schema.prisma already declared these, but they were never applied to the
-- live database (found while re-checking check_missing_indexes after the
-- 20260723_missing_fk_indexes migration). Applied directly to prod via
-- Supabase apply_migration; this file brings the migration history back in
-- sync so `prisma migrate deploy` doesn't drift further.

CREATE INDEX IF NOT EXISTS "MarketplaceOrder_serviceId_idx" ON "MarketplaceOrder"("serviceId");
CREATE UNIQUE INDEX IF NOT EXISTS "WishlistItem_userId_itemType_itemId_key" ON "WishlistItem"("userId", "itemType", "itemId");
