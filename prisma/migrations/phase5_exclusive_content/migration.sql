-- Phase 5: Expand ExclusiveContent model with missing fields
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "accessTierIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "isFreePreview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExclusiveContent" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "ExclusiveContent" ALTER COLUMN "contentUrl" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "ExclusiveContent_artistId_isPublished_idx" ON "ExclusiveContent"("artistId", "isPublished");
