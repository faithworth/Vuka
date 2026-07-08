-- Stories (24h ephemeral updates) + Reels (short-form video)
-- Applied automatically by the existing build pipeline
-- (`node scripts/migrate.js` -> `prisma migrate deploy`) on the next deploy.
-- No manual SQL-editor step required.

CREATE TABLE IF NOT EXISTS "Story" (
  "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"  TEXT NOT NULL,
  "mediaUrl"  TEXT NOT NULL,
  "mediaType" TEXT NOT NULL DEFAULT 'image',
  "caption"   TEXT NOT NULL DEFAULT '',
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "Story_artistId_expiresAt_idx" ON "Story"("artistId", "expiresAt");
CREATE INDEX IF NOT EXISTS "Story_expiresAt_idx" ON "Story"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "Story" ADD CONSTRAINT "Story_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StoryView" (
  "id"       TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "storyId"  TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoryView_storyId_userId_key" ON "StoryView"("storyId", "userId");
CREATE INDEX IF NOT EXISTS "StoryView_storyId_idx" ON "StoryView"("storyId");

DO $$ BEGIN
  ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Reel" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "artistId"     TEXT NOT NULL,
  "videoUrl"     TEXT NOT NULL,
  "thumbnailUrl" TEXT NOT NULL DEFAULT '',
  "caption"      TEXT NOT NULL DEFAULT '',
  "likeCount"    INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "repostCount"  INTEGER NOT NULL DEFAULT 0,
  "viewCount"    INTEGER NOT NULL DEFAULT 0,
  "isPublished"  BOOLEAN NOT NULL DEFAULT true,
  "publishedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Reel_artistId_isPublished_publishedAt_idx" ON "Reel"("artistId", "isPublished", "publishedAt");
CREATE INDEX IF NOT EXISTS "Reel_isPublished_publishedAt_idx" ON "Reel"("isPublished", "publishedAt");

DO $$ BEGIN
  ALTER TABLE "Reel" ADD CONSTRAINT "Reel_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
