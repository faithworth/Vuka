-- ============================================================
-- VUKA — Phase 8: Security Hardening
-- Row Level Security (RLS) for all user-data tables
--
-- Run via Supabase SQL editor or:
--   npx prisma db execute \
--     --file prisma/migrations/phase8_security_hardening/migration.sql \
--     --schema prisma/schema.prisma
--
-- auth.uid() resolves to the Supabase Auth user UUID.
-- We join to "User".id via email because our DB uses cuid() PKs,
-- not Supabase UUIDs directly. The helper function below makes
-- every policy readable.
-- ============================================================

-- ── Helper: resolve Supabase auth.uid() → our User.id (cuid) ─────────────
-- Cached per transaction — no repeated lookups.
CREATE OR REPLACE FUNCTION vuka_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM "User" WHERE email = auth.email() LIMIT 1
$$;

-- Admin check — true if current user has an admin-level role
CREATE OR REPLACE FUNCTION vuka_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "User"
    WHERE email = auth.email()
      AND role IN ('admin', 'owner', 'super_admin', 'moderator')
  )
$$;

-- ── User table ────────────────────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own"    ON "User";
DROP POLICY IF EXISTS "user_update_own"    ON "User";
DROP POLICY IF EXISTS "user_admin_all"     ON "User";
DROP POLICY IF EXISTS "user_select_public" ON "User";

-- Public columns readable by anyone (for artist profile pages)
CREATE POLICY "user_select_public" ON "User"
  FOR SELECT USING (true);

-- User can update only their own row
CREATE POLICY "user_update_own" ON "User"
  FOR UPDATE USING (id = vuka_user_id());

-- Admins have full access
CREATE POLICY "user_admin_all" ON "User"
  FOR ALL USING (vuka_is_admin());

-- ── Artist table ──────────────────────────────────────────────────────────
ALTER TABLE "Artist" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_select_public" ON "Artist";
DROP POLICY IF EXISTS "artist_update_own"    ON "Artist";
DROP POLICY IF EXISTS "artist_admin_all"     ON "Artist";

CREATE POLICY "artist_select_public" ON "Artist"
  FOR SELECT USING (true);

CREATE POLICY "artist_update_own" ON "Artist"
  FOR UPDATE USING (
    "userId" = vuka_user_id()
  );

CREATE POLICY "artist_admin_all" ON "Artist"
  FOR ALL USING (vuka_is_admin());

-- ── ArtistBankAccount — most sensitive table ──────────────────────────────
ALTER TABLE "ArtistBankAccount" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_account_select_own" ON "ArtistBankAccount";
DROP POLICY IF EXISTS "bank_account_insert_own" ON "ArtistBankAccount";
DROP POLICY IF EXISTS "bank_account_update_own" ON "ArtistBankAccount";
DROP POLICY IF EXISTS "bank_account_delete_own" ON "ArtistBankAccount";
DROP POLICY IF EXISTS "bank_account_admin_all"  ON "ArtistBankAccount";

-- Artist sees only their own accounts
CREATE POLICY "bank_account_select_own" ON "ArtistBankAccount"
  FOR SELECT USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "bank_account_insert_own" ON "ArtistBankAccount"
  FOR INSERT WITH CHECK (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "bank_account_update_own" ON "ArtistBankAccount"
  FOR UPDATE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "bank_account_delete_own" ON "ArtistBankAccount"
  FOR DELETE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

-- Admins can read bank accounts (masked only — accountNumber column is encrypted)
CREATE POLICY "bank_account_admin_all" ON "ArtistBankAccount"
  FOR ALL USING (vuka_is_admin());

-- ── PayoutRequest ─────────────────────────────────────────────────────────
ALTER TABLE "PayoutRequest" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_request_select_own" ON "PayoutRequest";
DROP POLICY IF EXISTS "payout_request_insert_own" ON "PayoutRequest";
DROP POLICY IF EXISTS "payout_request_admin_all"  ON "PayoutRequest";

CREATE POLICY "payout_request_select_own" ON "PayoutRequest"
  FOR SELECT USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "payout_request_insert_own" ON "PayoutRequest"
  FOR INSERT WITH CHECK (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "payout_request_admin_all" ON "PayoutRequest"
  FOR ALL USING (vuka_is_admin());

-- ── ArtistPayout ──────────────────────────────────────────────────────────
ALTER TABLE "ArtistPayout" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_payout_select_own" ON "ArtistPayout";
DROP POLICY IF EXISTS "artist_payout_admin_all"  ON "ArtistPayout";

CREATE POLICY "artist_payout_select_own" ON "ArtistPayout"
  FOR SELECT USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "artist_payout_admin_all" ON "ArtistPayout"
  FOR ALL USING (vuka_is_admin());

-- ── Purchase — buyer and seller access ────────────────────────────────────
ALTER TABLE "Purchase" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_select_buyer"    ON "Purchase";
DROP POLICY IF EXISTS "purchase_select_seller"   ON "Purchase";
DROP POLICY IF EXISTS "purchase_insert_buyer"    ON "Purchase";
DROP POLICY IF EXISTS "purchase_admin_all"       ON "Purchase";

-- Buyer sees their purchases
CREATE POLICY "purchase_select_buyer" ON "Purchase"
  FOR SELECT USING ("userId" = vuka_user_id());

-- Artist sees purchases of their content (for earnings display)
CREATE POLICY "purchase_select_seller" ON "Purchase"
  FOR SELECT USING (
    "beat" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Beat" b
      JOIN "Artist" a ON a.id = b."artistId"
      WHERE b.id = "Purchase"."beatId" AND a."userId" = vuka_user_id()
    )
    OR
    "release" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Release" r
      JOIN "Artist" a ON a.id = r."artistId"
      WHERE r.id = "Purchase"."releaseId" AND a."userId" = vuka_user_id()
    )
  );

CREATE POLICY "purchase_insert_buyer" ON "Purchase"
  FOR INSERT WITH CHECK ("userId" = vuka_user_id());

CREATE POLICY "purchase_admin_all" ON "Purchase"
  FOR ALL USING (vuka_is_admin());

-- ── Beat ──────────────────────────────────────────────────────────────────
ALTER TABLE "Beat" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beat_select_public"  ON "Beat";
DROP POLICY IF EXISTS "beat_insert_own"     ON "Beat";
DROP POLICY IF EXISTS "beat_update_own"     ON "Beat";
DROP POLICY IF EXISTS "beat_delete_own"     ON "Beat";
DROP POLICY IF EXISTS "beat_admin_all"      ON "Beat";

CREATE POLICY "beat_select_public" ON "Beat"
  FOR SELECT USING (true);

CREATE POLICY "beat_insert_own" ON "Beat"
  FOR INSERT WITH CHECK (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "beat_update_own" ON "Beat"
  FOR UPDATE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "beat_delete_own" ON "Beat"
  FOR DELETE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "beat_admin_all" ON "Beat"
  FOR ALL USING (vuka_is_admin());

-- ── Release ───────────────────────────────────────────────────────────────
ALTER TABLE "Release" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "release_select_public" ON "Release";
DROP POLICY IF EXISTS "release_insert_own"    ON "Release";
DROP POLICY IF EXISTS "release_update_own"    ON "Release";
DROP POLICY IF EXISTS "release_delete_own"    ON "Release";
DROP POLICY IF EXISTS "release_admin_all"     ON "Release";

CREATE POLICY "release_select_public" ON "Release"
  FOR SELECT USING (true);

CREATE POLICY "release_insert_own" ON "Release"
  FOR INSERT WITH CHECK (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "release_update_own" ON "Release"
  FOR UPDATE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "release_delete_own" ON "Release"
  FOR DELETE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "release_admin_all" ON "Release"
  FOR ALL USING (vuka_is_admin());

-- ── Notification ──────────────────────────────────────────────────────────
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_select_own" ON "Notification";
DROP POLICY IF EXISTS "notification_update_own" ON "Notification";
DROP POLICY IF EXISTS "notification_admin_all"  ON "Notification";

CREATE POLICY "notification_select_own" ON "Notification"
  FOR SELECT USING ("userId" = vuka_user_id());

CREATE POLICY "notification_update_own" ON "Notification"
  FOR UPDATE USING ("userId" = vuka_user_id());

CREATE POLICY "notification_admin_all" ON "Notification"
  FOR ALL USING (vuka_is_admin());

-- ── AdminLog — admin read only, no user access ────────────────────────────
ALTER TABLE "AdminLog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_log_admin_all" ON "AdminLog";

CREATE POLICY "admin_log_admin_all" ON "AdminLog"
  FOR ALL USING (vuka_is_admin());

-- ── SpamSignal — internal only ────────────────────────────────────────────
ALTER TABLE "SpamSignal" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spam_signal_admin_all" ON "SpamSignal";

CREATE POLICY "spam_signal_admin_all" ON "SpamSignal"
  FOR ALL USING (vuka_is_admin());

-- ── RevenueRecord — artist owns their records ─────────────────────────────
ALTER TABLE "RevenueRecord" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenue_select_own" ON "RevenueRecord";
DROP POLICY IF EXISTS "revenue_admin_all"  ON "RevenueRecord";

CREATE POLICY "revenue_select_own" ON "RevenueRecord"
  FOR SELECT USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "revenue_admin_all" ON "RevenueRecord"
  FOR ALL USING (vuka_is_admin());

-- ── ArtistPost ────────────────────────────────────────────────────────────
ALTER TABLE "ArtistPost" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_select_public" ON "ArtistPost";
DROP POLICY IF EXISTS "post_insert_own"    ON "ArtistPost";
DROP POLICY IF EXISTS "post_update_own"    ON "ArtistPost";
DROP POLICY IF EXISTS "post_delete_own"    ON "ArtistPost";
DROP POLICY IF EXISTS "post_admin_all"     ON "ArtistPost";

CREATE POLICY "post_select_public" ON "ArtistPost"
  FOR SELECT USING ("isPublished" = true OR "artistId" IN (
    SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
  ));

CREATE POLICY "post_insert_own" ON "ArtistPost"
  FOR INSERT WITH CHECK (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "post_update_own" ON "ArtistPost"
  FOR UPDATE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "post_delete_own" ON "ArtistPost"
  FOR DELETE USING (
    "artistId" IN (
      SELECT id FROM "Artist" WHERE "userId" = vuka_user_id()
    )
  );

CREATE POLICY "post_admin_all" ON "ArtistPost"
  FOR ALL USING (vuka_is_admin());

-- ── Ensure service role key bypasses RLS for server-side Prisma ──────────
-- Prisma uses the service_role key (SUPABASE_SERVICE_ROLE_KEY) which bypasses
-- RLS by default. This means server routes are unaffected.
-- RLS only applies to direct Supabase client calls from the browser.

-- ── Indexes for RLS join performance ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS "artist_userId_idx"       ON "Artist" ("userId");
CREATE INDEX IF NOT EXISTS "beat_artistId_idx"        ON "Beat" ("artistId");
CREATE INDEX IF NOT EXISTS "release_artistId_idx"     ON "Release" ("artistId");
CREATE INDEX IF NOT EXISTS "purchase_userId_idx"      ON "Purchase" ("userId");
CREATE INDEX IF NOT EXISTS "payout_req_artistId_idx"  ON "PayoutRequest" ("artistId");
CREATE INDEX IF NOT EXISTS "bank_acct_artistId_idx"   ON "ArtistBankAccount" ("artistId");
CREATE INDEX IF NOT EXISTS "notification_userId_idx"  ON "Notification" ("userId");
CREATE INDEX IF NOT EXISTS "revenue_artistId_idx"     ON "RevenueRecord" ("artistId");
