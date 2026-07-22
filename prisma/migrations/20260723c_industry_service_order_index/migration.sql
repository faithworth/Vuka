-- IndustryServiceOrder is not modeled in schema.prisma (accessed via raw SQL
-- in src/lib/webhooks/paystack-handlers.ts and src/app/api/industry/order),
-- so it was invisible to `prisma migrate` schema diffing and never got this
-- index despite being queried on every industry order webhook.

CREATE INDEX IF NOT EXISTS "IndustryServiceOrder_serviceId_idx" ON "IndustryServiceOrder"("serviceId");
