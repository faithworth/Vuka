-- Tracks every slug an artist has ever used, so old /artist/<slug> store
-- links keep working (redirected to the current slug) after someone
-- changes their display name in Settings and their slug auto-updates.

CREATE TABLE IF NOT EXISTS "ArtistSlugHistory" (
  "id"        TEXT NOT NULL,
  "artistId"  TEXT NOT NULL,
  "oldSlug"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtistSlugHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArtistSlugHistory_oldSlug_key" ON "ArtistSlugHistory"("oldSlug");
CREATE INDEX IF NOT EXISTS "ArtistSlugHistory_artistId_idx" ON "ArtistSlugHistory"("artistId");

ALTER TABLE "ArtistSlugHistory"
  ADD CONSTRAINT "ArtistSlugHistory_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
