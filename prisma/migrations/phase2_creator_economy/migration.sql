-- ============================================================
-- PHASE 2: Creator Economy + Distribution + Marketplace
-- Safe incremental migration — all IF NOT EXISTS
-- Run: npx prisma migrate dev --name phase2_creator_economy
-- ============================================================

-- ── DISTRIBUTION ENGINE ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DistributionRelease" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "artistId"            TEXT NOT NULL,
  "releaseId"           TEXT,
  "title"               TEXT NOT NULL,
  "artistName"          TEXT NOT NULL,
  "featuredArtists"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  "releaseType"         TEXT NOT NULL DEFAULT 'single',
  "primaryGenre"        TEXT NOT NULL DEFAULT '',
  "secondaryGenre"      TEXT NOT NULL DEFAULT '',
  "language"            TEXT NOT NULL DEFAULT 'en',
  "upc"                 TEXT UNIQUE,
  "isrc"                TEXT,
  "artworkUrl"          TEXT NOT NULL DEFAULT '',
  "artworkStatus"       TEXT NOT NULL DEFAULT 'pending',
  "artworkNotes"        TEXT NOT NULL DEFAULT '',
  "originalReleaseDate" TIMESTAMP(3),
  "scheduledDate"       TIMESTAMP(3),
  "releasedAt"          TIMESTAMP(3),
  "status"              TEXT NOT NULL DEFAULT 'draft',
  "statusHistory"       JSONB NOT NULL DEFAULT '[]',
  "adminNotes"          TEXT NOT NULL DEFAULT '',
  "copyrightHolder"     TEXT NOT NULL DEFAULT '',
  "copyrightYear"       INTEGER,
  "pLine"               TEXT NOT NULL DEFAULT '',
  "cLine"               TEXT NOT NULL DEFAULT '',
  "labelName"           TEXT NOT NULL DEFAULT '',
  "catalogNumber"       TEXT NOT NULL DEFAULT '',
  "targetDSPs"          TEXT[] DEFAULT ARRAY[]::TEXT[],
  "retryCount"          INTEGER NOT NULL DEFAULT 0,
  "lastRetryAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionRelease_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DistributionRelease_artistId_idx" ON "DistributionRelease"("artistId");
CREATE INDEX IF NOT EXISTS "DistributionRelease_status_idx"   ON "DistributionRelease"("status");
CREATE INDEX IF NOT EXISTS "DistributionRelease_upc_idx"      ON "DistributionRelease"("upc");

CREATE TABLE IF NOT EXISTS "DistributionTrack" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "distributionReleaseId" TEXT NOT NULL,
  "trackNumber"           INTEGER NOT NULL,
  "title"                 TEXT NOT NULL,
  "featuredArtists"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isrc"                  TEXT UNIQUE,
  "composers"             TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lyricists"             TEXT[] DEFAULT ARRAY[]::TEXT[],
  "producers"             TEXT[] DEFAULT ARRAY[]::TEXT[],
  "explicit"              BOOLEAN NOT NULL DEFAULT FALSE,
  "language"              TEXT NOT NULL DEFAULT 'en',
  "duration"              INTEGER NOT NULL DEFAULT 0,
  "masterFileUrl"         TEXT NOT NULL DEFAULT '',
  "masterFileStatus"      TEXT NOT NULL DEFAULT 'pending',
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionTrack_distributionReleaseId_fkey"
    FOREIGN KEY ("distributionReleaseId") REFERENCES "DistributionRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DistributionTrack_distributionReleaseId_idx" ON "DistributionTrack"("distributionReleaseId");

CREATE TABLE IF NOT EXISTS "DSPDelivery" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "distributionReleaseId" TEXT NOT NULL,
  "dsp"                   TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'pending',
  "submittedAt"           TIMESTAMP(3),
  "liveAt"                TIMESTAMP(3),
  "failedAt"              TIMESTAMP(3),
  "rolledBackAt"          TIMESTAMP(3),
  "dspReferenceId"        TEXT NOT NULL DEFAULT '',
  "errorMessage"          TEXT NOT NULL DEFAULT '',
  "retryCount"            INTEGER NOT NULL DEFAULT 0,
  "lastRetryAt"           TIMESTAMP(3),
  "deliveryPayload"       JSONB,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DSPDelivery_distributionReleaseId_fkey"
    FOREIGN KEY ("distributionReleaseId") REFERENCES "DistributionRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DSPDelivery_distributionReleaseId_idx" ON "DSPDelivery"("distributionReleaseId");
CREATE INDEX IF NOT EXISTS "DSPDelivery_dsp_status_idx"            ON "DSPDelivery"("dsp","status");

-- ── CREATOR SUBSCRIPTIONS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CreatorSubscriptionTier" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "artistId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT NOT NULL DEFAULT '',
  "priceMonthly"   DOUBLE PRECISION NOT NULL,
  "priceYearly"    DOUBLE PRECISION,
  "currency"       TEXT NOT NULL DEFAULT 'ZAR',
  "perks"          JSONB NOT NULL DEFAULT '[]',
  "maxSubscribers" INTEGER,
  "isActive"       BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreatorSubscriptionTier_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CreatorSubscriptionTier_artistId_idx" ON "CreatorSubscriptionTier"("artistId");

CREATE TABLE IF NOT EXISTS "CreatorMembership" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "userId"              TEXT NOT NULL,
  "tierId"              TEXT NOT NULL,
  "artistId"            TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'active',
  "billingInterval"     TEXT NOT NULL DEFAULT 'monthly',
  "currentPeriodStart"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodEnd"    TIMESTAMP(3) NOT NULL,
  "cancelledAt"         TIMESTAMP(3),
  "payfastToken"        TEXT,
  "stripeSubId"         TEXT,
  "lastPaymentAt"       TIMESTAMP(3),
  "lastPaymentAmount"   DOUBLE PRECISION,
  "totalPaid"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreatorMembership_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreatorMembership_tierId_fkey"   FOREIGN KEY ("tierId")   REFERENCES "CreatorSubscriptionTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreatorMembership_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreatorMembership_userId_tierId_key" UNIQUE ("userId","tierId")
);

CREATE INDEX IF NOT EXISTS "CreatorMembership_userId_idx"   ON "CreatorMembership"("userId");
CREATE INDEX IF NOT EXISTS "CreatorMembership_artistId_idx" ON "CreatorMembership"("artistId");
CREATE INDEX IF NOT EXISTS "CreatorMembership_status_idx"   ON "CreatorMembership"("status");

CREATE TABLE IF NOT EXISTS "ExclusiveContent" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "artistId"      TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT NOT NULL DEFAULT '',
  "contentType"   TEXT NOT NULL,
  "fileUrl"       TEXT NOT NULL DEFAULT '',
  "thumbnailUrl"  TEXT NOT NULL DEFAULT '',
  "externalUrl"   TEXT NOT NULL DEFAULT '',
  "body"          TEXT NOT NULL DEFAULT '',
  "accessTierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isFreePreview" BOOLEAN NOT NULL DEFAULT FALSE,
  "publishedAt"   TIMESTAMP(3),
  "isPublished"   BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExclusiveContent_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ExclusiveContent_artistId_idx" ON "ExclusiveContent"("artistId");

-- ── CREATOR STOREFRONT ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CreatorStorefront" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "artistId"         TEXT NOT NULL UNIQUE,
  "heroHeadline"     TEXT NOT NULL DEFAULT '',
  "heroSubtext"      TEXT NOT NULL DEFAULT '',
  "heroImageUrl"     TEXT NOT NULL DEFAULT '',
  "accentColor"      TEXT NOT NULL DEFAULT '#8B5CF6',
  "featuredBeats"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "featuredReleases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "featuredServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "metaTitle"        TEXT NOT NULL DEFAULT '',
  "metaDescription"  TEXT NOT NULL DEFAULT '',
  "isLive"           BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreatorStorefront_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── MARKETPLACE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MarketplaceService" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "artistId"      TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT NOT NULL DEFAULT '',
  "category"      TEXT NOT NULL,
  "packages"      JSONB NOT NULL DEFAULT '[]',
  "portfolioUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requirements"  TEXT NOT NULL DEFAULT '',
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "totalOrders"   INTEGER NOT NULL DEFAULT 0,
  "rating"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reviewCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceService_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MarketplaceService_artistId_idx"  ON "MarketplaceService"("artistId");
CREATE INDEX IF NOT EXISTS "MarketplaceService_category_idx"  ON "MarketplaceService"("category");

CREATE TABLE IF NOT EXISTS "MarketplaceOrder" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "serviceId"       TEXT NOT NULL,
  "buyerUserId"     TEXT NOT NULL,
  "sellerArtistId"  TEXT NOT NULL,
  "packageName"     TEXT NOT NULL,
  "packagePrice"    DOUBLE PRECISION NOT NULL,
  "currency"        TEXT NOT NULL DEFAULT 'ZAR',
  "requirements"    TEXT NOT NULL DEFAULT '',
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "deliveryDays"    INTEGER NOT NULL,
  "dueAt"           TIMESTAMP(3),
  "deliveredAt"     TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "deliverables"    JSONB NOT NULL DEFAULT '[]',
  "sellerNotes"     TEXT NOT NULL DEFAULT '',
  "revisionCount"   INTEGER NOT NULL DEFAULT 0,
  "maxRevisions"    INTEGER NOT NULL DEFAULT 1,
  "revisionNotes"   TEXT NOT NULL DEFAULT '',
  "purchaseId"      TEXT,
  "payfastRef"      TEXT,
  "stripePaymentId" TEXT,
  "platformFee"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netAmount"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceOrder_serviceId_fkey"      FOREIGN KEY ("serviceId")      REFERENCES "MarketplaceService"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceOrder_buyerUserId_fkey"    FOREIGN KEY ("buyerUserId")    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceOrder_sellerArtistId_fkey" FOREIGN KEY ("sellerArtistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MarketplaceOrder_buyerUserId_idx"    ON "MarketplaceOrder"("buyerUserId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_sellerArtistId_idx" ON "MarketplaceOrder"("sellerArtistId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_status_idx"         ON "MarketplaceOrder"("status");

CREATE TABLE IF NOT EXISTS "OrderMilestone" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "orderId"     TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "amount"      DOUBLE PRECISION NOT NULL,
  "dueAt"       TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderMilestone_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MarketplaceDispute" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "orderId"         TEXT NOT NULL UNIQUE,
  "raisedByUserId"  TEXT NOT NULL,
  "reason"          TEXT NOT NULL,
  "evidence"        JSONB NOT NULL DEFAULT '[]',
  "status"          TEXT NOT NULL DEFAULT 'open',
  "adminNotes"      TEXT NOT NULL DEFAULT '',
  "resolution"      TEXT NOT NULL DEFAULT '',
  "resolvedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceDispute_orderId_fkey"        FOREIGN KEY ("orderId")        REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceDispute_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ServiceReview" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "serviceId"      TEXT NOT NULL,
  "orderId"        TEXT NOT NULL UNIQUE,
  "reviewerUserId" TEXT NOT NULL,
  "rating"         INTEGER NOT NULL,
  "comment"        TEXT NOT NULL DEFAULT '',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceReview_serviceId_fkey"      FOREIGN KEY ("serviceId")      REFERENCES "MarketplaceService"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── BEAT LICENSING ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BeatLicense" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "beatId"        TEXT NOT NULL,
  "purchaseId"    TEXT NOT NULL UNIQUE,
  "licenseType"   TEXT NOT NULL,
  "licenseKey"    TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  "streams"       INTEGER,
  "salesCap"      INTEGER,
  "radioStations" BOOLEAN NOT NULL DEFAULT FALSE,
  "tvSync"        BOOLEAN NOT NULL DEFAULT FALSE,
  "musicVideo"    BOOLEAN NOT NULL DEFAULT FALSE,
  "profitSharing" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "buyerName"     TEXT NOT NULL,
  "buyerEmail"    TEXT NOT NULL,
  "artistName"    TEXT NOT NULL DEFAULT '',
  "songTitle"     TEXT NOT NULL DEFAULT '',
  "issuedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"     TIMESTAMP(3),
  "pdfUrl"        TEXT NOT NULL DEFAULT '',
  CONSTRAINT "BeatLicense_beatId_fkey"    FOREIGN KEY ("beatId")    REFERENCES "Beat"("id")     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BeatLicense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BeatLicense_beatId_idx" ON "BeatLicense"("beatId");

-- ── PAYOUT INFRASTRUCTURE ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PayoutRequest" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "artistId"        TEXT NOT NULL,
  "amount"          DOUBLE PRECISION NOT NULL,
  "currency"        TEXT NOT NULL DEFAULT 'ZAR',
  "method"          TEXT NOT NULL,
  "bankAccountRef"  TEXT NOT NULL DEFAULT '',
  "bankName"        TEXT NOT NULL DEFAULT '',
  "accountHolder"   TEXT NOT NULL DEFAULT '',
  "paypalEmail"     TEXT NOT NULL DEFAULT '',
  "payfastRef"      TEXT NOT NULL DEFAULT '',
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "adminNotes"      TEXT NOT NULL DEFAULT '',
  "failureReason"   TEXT NOT NULL DEFAULT '',
  "payoutIds"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requestedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"     TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "retryCount"      INTEGER NOT NULL DEFAULT 0,
  "lastRetryAt"     TIMESTAMP(3),
  CONSTRAINT "PayoutRequest_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PayoutRequest_artistId_idx" ON "PayoutRequest"("artistId");
CREATE INDEX IF NOT EXISTS "PayoutRequest_status_idx"   ON "PayoutRequest"("status");

CREATE TABLE IF NOT EXISTS "PayoutSplit" (
  "id"                 TEXT NOT NULL PRIMARY KEY,
  "payoutRequestId"    TEXT NOT NULL,
  "collaboratorEmail"  TEXT NOT NULL,
  "collaboratorName"   TEXT NOT NULL,
  "splitPercent"       DOUBLE PRECISION NOT NULL,
  "amount"             DOUBLE PRECISION NOT NULL,
  "currency"           TEXT NOT NULL DEFAULT 'ZAR',
  "payoutMethod"       TEXT NOT NULL DEFAULT 'payfast',
  "payfastRef"         TEXT NOT NULL DEFAULT '',
  "paypalEmail"        TEXT NOT NULL DEFAULT '',
  "status"             TEXT NOT NULL DEFAULT 'pending',
  "sentAt"             TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutSplit_payoutRequestId_fkey"
    FOREIGN KEY ("payoutRequestId") REFERENCES "PayoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── BUSINESS INFRASTRUCTURE ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "invoiceNumber" TEXT NOT NULL UNIQUE,
  "artistId"      TEXT,
  "buyerName"     TEXT NOT NULL,
  "buyerEmail"    TEXT NOT NULL,
  "buyerAddress"  JSONB NOT NULL DEFAULT '{}',
  "lineItems"     JSONB NOT NULL,
  "subtotal"      DOUBLE PRECISION NOT NULL,
  "taxRate"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxAmount"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"         DOUBLE PRECISION NOT NULL,
  "currency"      TEXT NOT NULL DEFAULT 'ZAR',
  "status"        TEXT NOT NULL DEFAULT 'draft',
  "dueDate"       TIMESTAMP(3),
  "paidAt"        TIMESTAMP(3),
  "purchaseId"    TEXT,
  "orderId"       TEXT,
  "pdfUrl"        TEXT NOT NULL DEFAULT '',
  "notes"         TEXT NOT NULL DEFAULT '',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Invoice_artistId_idx" ON "Invoice"("artistId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx"   ON "Invoice"("status");

CREATE TABLE IF NOT EXISTS "RevenueRecord" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "artistId"      TEXT NOT NULL,
  "period"        TEXT NOT NULL,
  "beatSales"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "releaseSales"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "subscriptions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "marketplace"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tips"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "distribution"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "other"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "grossRevenue"  DOUBLE PRECISION NOT NULL,
  "platformFees"  DOUBLE PRECISION NOT NULL,
  "netRevenue"    DOUBLE PRECISION NOT NULL,
  "payoutAmount"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pendingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency"      TEXT NOT NULL DEFAULT 'ZAR',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevenueRecord_artistId_period_key" UNIQUE ("artistId","period"),
  CONSTRAINT "RevenueRecord_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RevenueRecord_artistId_idx" ON "RevenueRecord"("artistId");

CREATE TABLE IF NOT EXISTS "TaxRecord" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "artistId"    TEXT NOT NULL,
  "taxYear"     INTEGER NOT NULL,
  "totalIncome" DOUBLE PRECISION NOT NULL,
  "totalFees"   DOUBLE PRECISION NOT NULL,
  "netIncome"   DOUBLE PRECISION NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'ZAR',
  "breakdown"   JSONB NOT NULL DEFAULT '{}',
  "pdfUrl"      TEXT NOT NULL DEFAULT '',
  "generatedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxRecord_artistId_taxYear_key" UNIQUE ("artistId","taxYear"),
  CONSTRAINT "TaxRecord_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PlatformCommission" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "purchaseId"       TEXT,
  "orderId"          TEXT,
  "source"           TEXT NOT NULL,
  "grossAmount"      DOUBLE PRECISION NOT NULL,
  "commissionRate"   DOUBLE PRECISION NOT NULL,
  "commissionAmount" DOUBLE PRECISION NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'ZAR',
  "artistId"         TEXT,
  "period"           TEXT NOT NULL DEFAULT '',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PlatformCommission_period_idx"   ON "PlatformCommission"("period");
CREATE INDEX IF NOT EXISTS "PlatformCommission_artistId_idx" ON "PlatformCommission"("artistId");

CREATE TABLE IF NOT EXISTS "ArtistBankAccount" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "artistId"            TEXT NOT NULL,
  "accountType"         TEXT NOT NULL,
  "bankName"            TEXT NOT NULL DEFAULT '',
  "branchCode"          TEXT NOT NULL DEFAULT '',
  "accountNumber"       TEXT NOT NULL DEFAULT '',
  "accountHolder"       TEXT NOT NULL DEFAULT '',
  "accountType2"        TEXT NOT NULL DEFAULT '',
  "paypalEmail"         TEXT NOT NULL DEFAULT '',
  "payfastMerchantId"   TEXT NOT NULL DEFAULT '',
  "isDefault"           BOOLEAN NOT NULL DEFAULT FALSE,
  "isVerified"          BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtistBankAccount_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ArtistBankAccount_artistId_idx" ON "ArtistBankAccount"("artistId");

-- ── Additional indexes for performance ───────────────────────

CREATE INDEX IF NOT EXISTS "CreatorMembership_tierId_idx"   ON "CreatorMembership"("tierId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_serviceId_idx" ON "MarketplaceOrder"("serviceId");
