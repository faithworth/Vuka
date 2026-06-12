-- ============================================================
-- VUKA CMS SYSTEM — Phase 10 Migration
-- Adds: cms_pages, cms_blocks, cms_revisions, featured_artists,
--       cms_media, cms_collaborations, cms_comments
-- ============================================================

-- ── cms_pages ───────────────────────────────────────────────
CREATE TABLE "cms_pages" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status"      TEXT NOT NULL DEFAULT 'draft',
  "isSystem"    BOOLEAN NOT NULL DEFAULT false,
  "metaTitle"   TEXT NOT NULL DEFAULT '',
  "metaDesc"    TEXT NOT NULL DEFAULT '',
  "publishedAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL DEFAULT 'system',
  "updatedById" TEXT NOT NULL DEFAULT 'system',

  CONSTRAINT "cms_pages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cms_pages_slug_key" ON "cms_pages"("slug");
CREATE INDEX "cms_pages_status_idx" ON "cms_pages"("status");

-- ── cms_blocks ──────────────────────────────────────────────
CREATE TABLE "cms_blocks" (
  "id"        TEXT NOT NULL,
  "pageId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL DEFAULT 'text',
  "label"     TEXT NOT NULL DEFAULT '',
  "content"   JSONB NOT NULL DEFAULT '{}',
  "order"     INTEGER NOT NULL DEFAULT 0,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cms_blocks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cms_blocks_pageId_order_idx" ON "cms_blocks"("pageId", "order");
ALTER TABLE "cms_blocks" ADD CONSTRAINT "cms_blocks_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── cms_revisions ───────────────────────────────────────────
CREATE TABLE "cms_revisions" (
  "id"          TEXT NOT NULL,
  "pageId"      TEXT NOT NULL,
  "blocks"      JSONB NOT NULL DEFAULT '[]',
  "summary"     TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,

  CONSTRAINT "cms_revisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cms_revisions_pageId_idx" ON "cms_revisions"("pageId");
ALTER TABLE "cms_revisions" ADD CONSTRAINT "cms_revisions_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── featured_artists ────────────────────────────────────────
CREATE TABLE "featured_artists" (
  "id"          TEXT NOT NULL,
  "artistId"    TEXT NOT NULL,
  "tagline"     TEXT NOT NULL DEFAULT '',
  "blurb"       TEXT NOT NULL DEFAULT '',
  "order"       INTEGER NOT NULL DEFAULT 0,
  "isVisible"   BOOLEAN NOT NULL DEFAULT true,
  "featuredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL DEFAULT 'system',

  CONSTRAINT "featured_artists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "featured_artists_artistId_key" ON "featured_artists"("artistId");
CREATE INDEX "featured_artists_order_isVisible_idx" ON "featured_artists"("order", "isVisible");
ALTER TABLE "featured_artists" ADD CONSTRAINT "featured_artists_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── cms_media ───────────────────────────────────────────────
CREATE TABLE "cms_media" (
  "id"           TEXT NOT NULL,
  "filename"     TEXT NOT NULL,
  "originalName" TEXT NOT NULL DEFAULT '',
  "mimeType"     TEXT NOT NULL DEFAULT '',
  "size"         INTEGER NOT NULL DEFAULT 0,
  "r2Key"        TEXT NOT NULL,
  "publicUrl"    TEXT NOT NULL DEFAULT '',
  "alt"          TEXT NOT NULL DEFAULT '',
  "caption"      TEXT NOT NULL DEFAULT '',
  "width"        INTEGER,
  "height"       INTEGER,
  "folder"       TEXT NOT NULL DEFAULT 'cms',
  "uploadedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cms_media_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cms_media_r2Key_key" ON "cms_media"("r2Key");
CREATE INDEX "cms_media_uploadedById_idx" ON "cms_media"("uploadedById");

-- ── cms_collaborations ──────────────────────────────────────
CREATE TABLE "cms_collaborations" (
  "id"         TEXT NOT NULL,
  "pageId"     TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "canEdit"    BOOLEAN NOT NULL DEFAULT true,
  "canPublish" BOOLEAN NOT NULL DEFAULT false,
  "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "addedById"  TEXT NOT NULL,

  CONSTRAINT "cms_collaborations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cms_collaborations_pageId_userId_key" ON "cms_collaborations"("pageId", "userId");
CREATE INDEX "cms_collaborations_userId_idx" ON "cms_collaborations"("userId");
ALTER TABLE "cms_collaborations" ADD CONSTRAINT "cms_collaborations_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_collaborations" ADD CONSTRAINT "cms_collaborations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── cms_comments ────────────────────────────────────────────
CREATE TABLE "cms_comments" (
  "id"          TEXT NOT NULL,
  "pageId"      TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "resolved"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,

  CONSTRAINT "cms_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cms_comments_pageId_idx" ON "cms_comments"("pageId");
ALTER TABLE "cms_comments" ADD CONSTRAINT "cms_comments_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seed: landing page as a system page (no blocks yet) ──────
-- The CMS falls back to the static LandingPage component until
-- an admin adds blocks and publishes this page. Once published
-- with blocks, the dynamic CMS landing page takes over.
INSERT INTO "cms_pages"
  ("id","slug","title","description","status","isSystem","metaTitle","metaDesc","updatedAt","createdById","updatedById")
VALUES
  ('cms_page_landing','landing','Landing Page','Main public homepage — Hero, Features, Pricing, Featured Artists','draft',true,
   'Vuka — Africa''s Independent Music Platform',
   'Sell beats and releases directly to your fans in South Africa and worldwide. Keep up to 95% of every sale.',
   CURRENT_TIMESTAMP,'system','system');

INSERT INTO "cms_pages" ("id","slug","title","description","status","isSystem","updatedAt","createdById","updatedById")
VALUES
  ('cms_page_terms',   'legal/terms',   'Terms of Service', 'Legal terms of service page', 'published', true, CURRENT_TIMESTAMP, 'system', 'system'),
  ('cms_page_privacy', 'legal/privacy', 'Privacy Policy',   'Privacy policy page',         'published', true, CURRENT_TIMESTAMP, 'system', 'system'),
  ('cms_page_dmca',    'legal/dmca',    'DMCA Policy',      'DMCA takedown policy page',   'published', true, CURRENT_TIMESTAMP, 'system', 'system');
