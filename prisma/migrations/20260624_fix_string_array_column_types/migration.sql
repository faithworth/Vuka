-- =============================================================================
-- MIGRATION: Fix String[] columns stored as JSON/text → native TEXT[] arrays
-- 
-- Root cause: Prisma schema declares these as String[] (expects Postgres text[])
-- but the live columns hold JSONB or TEXT containing JSON arrays like '["a","b"]'.
-- Prisma's deserializer throws:
--   "Inconsistent column data: List field did not return an Array from database.
--    Type identifier was String."
--
-- Strategy per column:
--   1. Skip if column is already text[] (idempotent, safe to re-run)
--   2. Add a shadow column _new as text[]
--   3. Backfill by parsing existing JSON via jsonb_array_elements_text
--   4. Drop old column, rename shadow → original name
--   5. Restore any relevant NOT NULL / DEFAULT constraints
--
-- Wrapped in a single transaction so it's all-or-nothing.
-- =============================================================================

BEGIN;

-- ─── Helper: convert a json/jsonb/text column to text[] ───────────────────────
-- We use the CASE approach: if the value is NULL or empty, produce '{}' (empty
-- array). Otherwise parse as jsonb and extract elements.
-- The DO $$ block checks current column type first so re-running is a no-op.

-- ─────────────────────────────────────────────────────────────────────────────
-- Artist.genreTags
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'Artist' AND column_name = 'genreTags';

  IF col_type IS NULL THEN
    -- Column does not exist yet; add it as text[]
    ALTER TABLE "Artist" ADD COLUMN "genreTags" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    -- Column exists but wrong type — convert
    ALTER TABLE "Artist" ADD COLUMN "genreTags_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "Artist"
    SET "genreTags_new" = CASE
      WHEN "genreTags" IS NULL OR "genreTags"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("genreTags"::jsonb))
    END;
    ALTER TABLE "Artist" DROP COLUMN "genreTags";
    ALTER TABLE "Artist" RENAME COLUMN "genreTags_new" TO "genreTags";
  END IF;
  -- If col_type = 'ARRAY' already, nothing to do.
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Beat.tags
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'Beat' AND column_name = 'tags';

  IF col_type IS NULL THEN
    ALTER TABLE "Beat" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "Beat" ADD COLUMN "tags_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "Beat"
    SET "tags_new" = CASE
      WHEN "tags" IS NULL OR "tags"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("tags"::jsonb))
    END;
    ALTER TABLE "Beat" DROP COLUMN "tags";
    ALTER TABLE "Beat" RENAME COLUMN "tags_new" TO "tags";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Video.tags
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'Video' AND column_name = 'tags';

  IF col_type IS NULL THEN
    ALTER TABLE "Video" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "Video" ADD COLUMN "tags_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "Video"
    SET "tags_new" = CASE
      WHEN "tags" IS NULL OR "tags"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("tags"::jsonb))
    END;
    ALTER TABLE "Video" DROP COLUMN "tags";
    ALTER TABLE "Video" RENAME COLUMN "tags_new" TO "tags";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sample.tags
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'Sample' AND column_name = 'tags';

  IF col_type IS NULL THEN
    ALTER TABLE "Sample" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "Sample" ADD COLUMN "tags_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "Sample"
    SET "tags_new" = CASE
      WHEN "tags" IS NULL OR "tags"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("tags"::jsonb))
    END;
    ALTER TABLE "Sample" DROP COLUMN "tags";
    ALTER TABLE "Sample" RENAME COLUMN "tags_new" TO "tags";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Subscription.perks
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'Subscription' AND column_name = 'perks';

  IF col_type IS NULL THEN
    ALTER TABLE "Subscription" ADD COLUMN "perks" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "Subscription" ADD COLUMN "perks_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "Subscription"
    SET "perks_new" = CASE
      WHEN "perks" IS NULL OR "perks"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("perks"::jsonb))
    END;
    ALTER TABLE "Subscription" DROP COLUMN "perks";
    ALTER TABLE "Subscription" RENAME COLUMN "perks_new" TO "perks";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Merch.sizes
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'Merch' AND column_name = 'sizes';

  IF col_type IS NULL THEN
    ALTER TABLE "Merch" ADD COLUMN "sizes" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "Merch" ADD COLUMN "sizes_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "Merch"
    SET "sizes_new" = CASE
      WHEN "sizes" IS NULL OR "sizes"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("sizes"::jsonb))
    END;
    ALTER TABLE "Merch" DROP COLUMN "sizes";
    ALTER TABLE "Merch" RENAME COLUMN "sizes_new" TO "sizes";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CreatorSubscriptionTier.perks
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'CreatorSubscriptionTier' AND column_name = 'perks';

  IF col_type IS NULL THEN
    ALTER TABLE "CreatorSubscriptionTier" ADD COLUMN "perks" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "CreatorSubscriptionTier" ADD COLUMN "perks_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "CreatorSubscriptionTier"
    SET "perks_new" = CASE
      WHEN "perks" IS NULL OR "perks"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("perks"::jsonb))
    END;
    ALTER TABLE "CreatorSubscriptionTier" DROP COLUMN "perks";
    ALTER TABLE "CreatorSubscriptionTier" RENAME COLUMN "perks_new" TO "perks";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MarketplaceService.portfolioUrls
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'MarketplaceService' AND column_name = 'portfolioUrls';

  IF col_type IS NULL THEN
    ALTER TABLE "MarketplaceService" ADD COLUMN "portfolioUrls" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "MarketplaceService" ADD COLUMN "portfolioUrls_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "MarketplaceService"
    SET "portfolioUrls_new" = CASE
      WHEN "portfolioUrls" IS NULL OR "portfolioUrls"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("portfolioUrls"::jsonb))
    END;
    ALTER TABLE "MarketplaceService" DROP COLUMN "portfolioUrls";
    ALTER TABLE "MarketplaceService" RENAME COLUMN "portfolioUrls_new" TO "portfolioUrls";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MarketplaceOrder.deliverables
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'MarketplaceOrder' AND column_name = 'deliverables';

  IF col_type IS NULL THEN
    ALTER TABLE "MarketplaceOrder" ADD COLUMN "deliverables" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "MarketplaceOrder" ADD COLUMN "deliverables_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "MarketplaceOrder"
    SET "deliverables_new" = CASE
      WHEN "deliverables" IS NULL OR "deliverables"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("deliverables"::jsonb))
    END;
    ALTER TABLE "MarketplaceOrder" DROP COLUMN "deliverables";
    ALTER TABLE "MarketplaceOrder" RENAME COLUMN "deliverables_new" TO "deliverables";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DistributionRelease.featuredArtists
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'DistributionRelease' AND column_name = 'featuredArtists';

  IF col_type IS NULL THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "featuredArtists" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "featuredArtists_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "DistributionRelease"
    SET "featuredArtists_new" = CASE
      WHEN "featuredArtists" IS NULL OR "featuredArtists"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("featuredArtists"::jsonb))
    END;
    ALTER TABLE "DistributionRelease" DROP COLUMN "featuredArtists";
    ALTER TABLE "DistributionRelease" RENAME COLUMN "featuredArtists_new" TO "featuredArtists";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DistributionRelease.targetDSPs
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'DistributionRelease' AND column_name = 'targetDSPs';

  IF col_type IS NULL THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "targetDSPs" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "targetDSPs_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "DistributionRelease"
    SET "targetDSPs_new" = CASE
      WHEN "targetDSPs" IS NULL OR "targetDSPs"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("targetDSPs"::jsonb))
    END;
    ALTER TABLE "DistributionRelease" DROP COLUMN "targetDSPs";
    ALTER TABLE "DistributionRelease" RENAME COLUMN "targetDSPs_new" TO "targetDSPs";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DistributionRelease.platforms
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'DistributionRelease' AND column_name = 'platforms';

  IF col_type IS NULL THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "platforms" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "DistributionRelease" ADD COLUMN "platforms_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "DistributionRelease"
    SET "platforms_new" = CASE
      WHEN "platforms" IS NULL OR "platforms"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("platforms"::jsonb))
    END;
    ALTER TABLE "DistributionRelease" DROP COLUMN "platforms";
    ALTER TABLE "DistributionRelease" RENAME COLUMN "platforms_new" TO "platforms";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DistributionTrack.composers
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'DistributionTrack' AND column_name = 'composers';

  IF col_type IS NULL THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "composers" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "composers_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "DistributionTrack"
    SET "composers_new" = CASE
      WHEN "composers" IS NULL OR "composers"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("composers"::jsonb))
    END;
    ALTER TABLE "DistributionTrack" DROP COLUMN "composers";
    ALTER TABLE "DistributionTrack" RENAME COLUMN "composers_new" TO "composers";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DistributionTrack.producers
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'DistributionTrack' AND column_name = 'producers';

  IF col_type IS NULL THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "producers" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "producers_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "DistributionTrack"
    SET "producers_new" = CASE
      WHEN "producers" IS NULL OR "producers"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("producers"::jsonb))
    END;
    ALTER TABLE "DistributionTrack" DROP COLUMN "producers";
    ALTER TABLE "DistributionTrack" RENAME COLUMN "producers_new" TO "producers";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DistributionTrack.featuredArtists
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'DistributionTrack' AND column_name = 'featuredArtists';

  IF col_type IS NULL THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "featuredArtists" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "featuredArtists_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "DistributionTrack"
    SET "featuredArtists_new" = CASE
      WHEN "featuredArtists" IS NULL OR "featuredArtists"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("featuredArtists"::jsonb))
    END;
    ALTER TABLE "DistributionTrack" DROP COLUMN "featuredArtists";
    ALTER TABLE "DistributionTrack" RENAME COLUMN "featuredArtists_new" TO "featuredArtists";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DistributionTrack.lyricists
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'DistributionTrack' AND column_name = 'lyricists';

  IF col_type IS NULL THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "lyricists" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "DistributionTrack" ADD COLUMN "lyricists_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "DistributionTrack"
    SET "lyricists_new" = CASE
      WHEN "lyricists" IS NULL OR "lyricists"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("lyricists"::jsonb))
    END;
    ALTER TABLE "DistributionTrack" DROP COLUMN "lyricists";
    ALTER TABLE "DistributionTrack" RENAME COLUMN "lyricists_new" TO "lyricists";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ArtistPost.mediaUrls
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'ArtistPost' AND column_name = 'mediaUrls';

  IF col_type IS NULL THEN
    ALTER TABLE "ArtistPost" ADD COLUMN "mediaUrls" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "ArtistPost" ADD COLUMN "mediaUrls_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "ArtistPost"
    SET "mediaUrls_new" = CASE
      WHEN "mediaUrls" IS NULL OR "mediaUrls"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("mediaUrls"::jsonb))
    END;
    ALTER TABLE "ArtistPost" DROP COLUMN "mediaUrls";
    ALTER TABLE "ArtistPost" RENAME COLUMN "mediaUrls_new" TO "mediaUrls";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SearchIndex.tags
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'SearchIndex' AND column_name = 'tags';

  IF col_type IS NULL THEN
    ALTER TABLE "SearchIndex" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "SearchIndex" ADD COLUMN "tags_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "SearchIndex"
    SET "tags_new" = CASE
      WHEN "tags" IS NULL OR "tags"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("tags"::jsonb))
    END;
    ALTER TABLE "SearchIndex" DROP COLUMN "tags";
    ALTER TABLE "SearchIndex" RENAME COLUMN "tags_new" TO "tags";
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- campaign_tiers.perks  (note: @@map → "campaign_tiers")
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'campaign_tiers' AND column_name = 'perks';

  IF col_type IS NULL THEN
    ALTER TABLE "campaign_tiers" ADD COLUMN "perks" TEXT[] NOT NULL DEFAULT '{}';
  ELSIF col_type NOT IN ('ARRAY') THEN
    ALTER TABLE "campaign_tiers" ADD COLUMN "perks_new" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "campaign_tiers"
    SET "perks_new" = CASE
      WHEN "perks" IS NULL OR "perks"::text IN ('', 'null', '[]') THEN '{}'
      ELSE ARRAY(SELECT jsonb_array_elements_text("perks"::jsonb))
    END;
    ALTER TABLE "campaign_tiers" DROP COLUMN "perks";
    ALTER TABLE "campaign_tiers" RENAME COLUMN "perks_new" TO "perks";
  END IF;
END $$;

COMMIT;
