-- Phase 5: Expand DistributionRelease, DistributionTrack, add DSPDelivery

-- DistributionRelease new fields
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "artistName"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "releaseType"     TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "primaryGenre"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "secondaryGenre"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "artworkUrl"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "artworkStatus"   TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "copyrightHolder" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "copyrightYear"   INTEGER;
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "targetDSPs"      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "scheduledFor"    TIMESTAMP(3);
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "adminNotes"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "DistributionRelease" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT NOT NULL DEFAULT '';

-- DistributionTrack new fields
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "masterFileUrl"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "masterFileStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "duration"         INTEGER;
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "explicit"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "composers"        TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "DistributionTrack" ADD COLUMN IF NOT EXISTS "producers"        TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "DistributionTrack" ALTER COLUMN "fileUrl" SET DEFAULT '';

-- DSPDelivery new model
CREATE TABLE IF NOT EXISTS "DSPDelivery" (
    "id"                    TEXT NOT NULL,
    "distributionReleaseId" TEXT NOT NULL,
    "dsp"                   TEXT NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'queued',
    "deliveryPayload"       JSONB NOT NULL DEFAULT '{}',
    "dspReferenceId"        TEXT,
    "errorMessage"          TEXT NOT NULL DEFAULT '',
    "retryCount"            INTEGER NOT NULL DEFAULT 0,
    "submittedAt"           TIMESTAMP(3),
    "liveAt"                TIMESTAMP(3),
    "failedAt"              TIMESTAMP(3),
    "lastRetryAt"           TIMESTAMP(3),
    "rolledBackAt"          TIMESTAMP(3),
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DSPDelivery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DSPDelivery" ADD CONSTRAINT "DSPDelivery_distributionReleaseId_fkey"
    FOREIGN KEY ("distributionReleaseId") REFERENCES "DistributionRelease"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "DSPDelivery_distributionReleaseId_status_idx" ON "DSPDelivery"("distributionReleaseId", "status");
CREATE INDEX IF NOT EXISTS "DSPDelivery_dsp_status_idx" ON "DSPDelivery"("dsp", "status");
