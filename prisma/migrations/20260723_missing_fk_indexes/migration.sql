-- Add indexes on foreign-key columns that had none, found by a repo-wide
-- audit (check_missing_indexes). Same class of issue as
-- 20260720_payment_reference_indexes: unindexed FKs used in joins/lookups
-- force full-table scans that get worse as each table grows.

CREATE INDEX IF NOT EXISTS "Beat_artistId_idx" ON "Beat"("artistId");
CREATE INDEX IF NOT EXISTS "Deal_industryUserId_idx" ON "Deal"("industryUserId");
CREATE INDEX IF NOT EXISTS "DistributionTrack_releaseId_idx" ON "DistributionTrack"("releaseId");
CREATE INDEX IF NOT EXISTS "Goal_artistId_idx" ON "Goal"("artistId");
CREATE INDEX IF NOT EXISTS "IndustryPayoutRequest_bankAccountId_idx" ON "IndustryPayoutRequest"("bankAccountId");
CREATE INDEX IF NOT EXISTS "IndustryService_industryUserId_idx" ON "IndustryService"("industryUserId");
CREATE INDEX IF NOT EXISTS "MarketplaceDispute_raisedByUserId_idx" ON "MarketplaceDispute"("raisedByUserId");
CREATE INDEX IF NOT EXISTS "Merch_artistId_idx" ON "Merch"("artistId");
CREATE INDEX IF NOT EXISTS "PageView_userId_idx" ON "PageView"("userId");
CREATE INDEX IF NOT EXISTS "PayoutRequest_bankAccountId_idx" ON "PayoutRequest"("bankAccountId");
CREATE INDEX IF NOT EXISTS "Purchase_userId_idx" ON "Purchase"("userId");
CREATE INDEX IF NOT EXISTS "Purchase_beatId_idx" ON "Purchase"("beatId");
CREATE INDEX IF NOT EXISTS "Purchase_videoId_idx" ON "Purchase"("videoId");
CREATE INDEX IF NOT EXISTS "Purchase_sampleId_idx" ON "Purchase"("sampleId");
CREATE INDEX IF NOT EXISTS "Purchase_subscriptionId_idx" ON "Purchase"("subscriptionId");
CREATE INDEX IF NOT EXISTS "Release_artistId_idx" ON "Release"("artistId");
CREATE INDEX IF NOT EXISTS "Sample_artistId_idx" ON "Sample"("artistId");
CREATE INDEX IF NOT EXISTS "SearchIndex_artistId_idx" ON "SearchIndex"("artistId");
CREATE INDEX IF NOT EXISTS "ServiceInquiry_artistId_idx" ON "ServiceInquiry"("artistId");
CREATE INDEX IF NOT EXISTS "ServiceInquiry_serviceId_idx" ON "ServiceInquiry"("serviceId");
CREATE INDEX IF NOT EXISTS "ServiceReview_serviceId_idx" ON "ServiceReview"("serviceId");
CREATE INDEX IF NOT EXISTS "ServiceReview_reviewerUserId_idx" ON "ServiceReview"("reviewerUserId");
CREATE INDEX IF NOT EXISTS "Subscription_artistId_idx" ON "Subscription"("artistId");
CREATE INDEX IF NOT EXISTS "SupportTxn_fanUserId_idx" ON "SupportTxn"("fanUserId");
CREATE INDEX IF NOT EXISTS "SupportTxn_artistId_idx" ON "SupportTxn"("artistId");
CREATE INDEX IF NOT EXISTS "Track_releaseId_idx" ON "Track"("releaseId");
CREATE INDEX IF NOT EXISTS "Video_artistId_idx" ON "Video"("artistId");
CREATE INDEX IF NOT EXISTS "campaign_backers_tierId_idx" ON "campaign_backers"("tierId");
CREATE INDEX IF NOT EXISTS "ticket_purchases_ticketId_idx" ON "ticket_purchases"("ticketId");
