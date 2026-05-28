-- DistributionTrack: add featuredArtists, lyricists, language
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "featuredArtists" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "lyricists"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "language"        TEXT   NOT NULL DEFAULT 'en';

-- DistributionRelease: add featuredArtists, language, labelName, pLine, cLine,
--   scheduledDate, originalReleaseDate, catalogNumber
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "featuredArtists"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "language"            TEXT   NOT NULL DEFAULT 'en';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "labelName"           TEXT   NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "pLine"               TEXT   NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "cLine"               TEXT   NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "scheduledDate"       TIMESTAMP(3);
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "originalReleaseDate" TIMESTAMP(3);
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "catalogNumber"       TEXT   NOT NULL DEFAULT '';

-- Deal: add artistSlug, dealType, offerAmount, currency
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "artistSlug"  TEXT             NOT NULL DEFAULT '';
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "dealType"    TEXT             NOT NULL DEFAULT 'licensing';
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "offerAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "currency"    TEXT             NOT NULL DEFAULT 'ZAR';

-- IndustryService: add priceZAR, pricingModel, deliveryDays
ALTER TABLE "IndustryService" ADD COLUMN IF NOT EXISTS "priceZAR"     DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "IndustryService" ADD COLUMN IF NOT EXISTS "pricingModel" TEXT             NOT NULL DEFAULT 'fixed';
ALTER TABLE "IndustryService" ADD COLUMN IF NOT EXISTS "deliveryDays" INTEGER          NOT NULL DEFAULT 7;

-- ServiceInquiry: make serviceId a real FK to IndustryService
--   serviceId already exists as TEXT DEFAULT ''; add the FK constraint only when non-empty
--   Use a partial index approach — add the FK as deferrable so empty-string rows are unaffected
-- (Prisma generated the relation as optional, so we just ensure the column exists; FK enforced at app level)
ALTER TABLE "ServiceInquiry" ALTER COLUMN "serviceId" DROP DEFAULT;
ALTER TABLE "ServiceInquiry" ALTER COLUMN "serviceId" SET DEFAULT '';

-- MarketplaceService: add packages (Json), portfolioUrls, requirements
ALTER TABLE "MarketplaceService" ADD COLUMN IF NOT EXISTS "packages"      JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "MarketplaceService" ADD COLUMN IF NOT EXISTS "portfolioUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketplaceService" ADD COLUMN IF NOT EXISTS "requirements"  TEXT   NOT NULL DEFAULT '';
