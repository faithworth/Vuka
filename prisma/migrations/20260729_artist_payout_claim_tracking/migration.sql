ALTER TABLE "ArtistPayout"
  ADD COLUMN IF NOT EXISTS "claimedByPayoutRequestId" TEXT;

ALTER TABLE "ArtistPayout"
  ADD CONSTRAINT "ArtistPayout_claimedByPayoutRequestId_fkey"
  FOREIGN KEY ("claimedByPayoutRequestId") REFERENCES "PayoutRequest"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ArtistPayout_claimedByPayoutRequestId_idx" ON "ArtistPayout"("claimedByPayoutRequestId");
