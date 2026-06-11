/**
 * GET /api/migrate
 *
 * Runs all pending database migrations after deployment.
 * Called automatically by Vercel as a post-deploy hook via vercel.json.
 * Protected by CRON_SECRET so only Vercel (or you) can trigger it.
 *
 * Fully idempotent — already-applied migrations are skipped silently.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';

const CRON_SECRET = process.env.CRON_SECRET;

// Migrations that existed before this script — baseline only, no SQL to run
const BASELINE_MIGRATIONS = [
  'phase2_creator_economy',
  'phase3_social_engine',
  'phase4_final_hardening',
  'phase5_distribution_engine',
  'phase5_exclusive_content',
  'phase5_status_history',
  // These were run manually outside the migrate route — mark as baseline so they're not re-run
  'phase5_platform_settings',
  'phase8_security_hardening',
  'phase9_email_system',
];

// New migrations to apply in order — append new ones to the BOTTOM only
const NEW_MIGRATIONS = [
  // 2025-05-26: Production hardening — Artist fields (payfastMerchant, currency, isVerified,
  // coverUrl, totalPlays, isPublic), ArtistPost feed fields, CreatorStorefront fields,
  // Track.isrc, Release.upc. All IF NOT EXISTS — safe to run on any existing DB.
  '20250526_production_hardening',
  // 2025-05-27: Platform settings table (admin-configurable) + email_logs + broadcast_logs.
  // Required by /api/admin/settings and /api/admin/broadcast routes.
  '20250527_platform_settings_and_email',
  '20250528_fix_schema_field_mismatches',
  '20250528_add_bank_account_payment_fields',
  '20250528_fix_pageview_analytics_fields',
  '20250528_fix_geography_unique',
  '20250528_fix_analytics_daily_rollup',
  '20250529_fix_schema_missing_fields',
  '20250529_fix_spamsignal_messaging',
  '20250529_fix_moderation_schema_fields',
  // 2025-05-31: User suspension fields (isSuspended, suspendedAt, suspendedReason)
  // Required by src/app/api/auth/me/route.ts and admin suspension system
  '20250531_user_suspension_and_roles',
  // 2026-06-04: Phase 12 cleanup — remove Stripe columns (IF EXISTS = no-op if never existed),
  // add payout/purchase indexes, add ArtistBankAccount.maskedNumber column
  '20260604_phase12_cleanup',
  // 2026-06-04: Role repair — fix users with Artist/IndustryUser records but wrong role in DB
  '20260604_role_repair',
  // 2026-06-08: Artist plan columns (planSlug, planExpiresAt) + index.
  // Required by /api/admin/plans, /api/admin/users, and the plan subscription system.
  'phase10_artist_plans',
  // 2026-06-08: ArtistPlanSubscription table (subscription history / billing records).
  '20260608_create_artist_plan_subscriptions',
  // 2026-06-08: Fix bank account updatedAt default + fix owner plan expiry grant.
  '20260608_fix_bank_account_updatedat',
  '20260608_fix_owner_plan_expiry',
  // 2026-06-09: DMCAReport missing columns — contentType, contentId, itemType, etc.
  // Table existed from a baseline migration but was created without these fields.
  '20260609_fix_dmca_missing_columns',
  // 2026-06-09: PayoutRequest.bankAccountId FK + ArtistPayout.reference/notes/currency/method.
  // Both columns confirmed missing in production via Vercel logs (503 errors on /api/admin/finance).
  '20260609_fix_payout_missing_columns',
  // 2026-06-09: PayoutRequest.createdAt — original table used requestedAt; Prisma expects createdAt.
  // Confirmed missing via Vercel log: "The column PayoutRequest.createdAt does not exist".
  '20260609_fix_payoutrequest_createdat',
  // 2026-06-09: DistributionRelease pricing — price/minPrice/payWhatYouWant missing from DB.
  // All dist. release sales were R0. Also adds Purchase.distributionReleaseId FK.
  '20260609_fix_distributionrelease_pricing',
  // 2026-06-10: Add distributor column to DistributionRelease.
  // Tracks which distribution partner handled the release (default: 'Vuka').
  'add_distributor_column',
  // 2026-06-10: IndustryServiceOrder table — artists pay industry professionals through Vuka.
  // Adds openToOffers flag on Artist + industryOrderId on ArtistPayout for earnings tracking.
  '20260610_industry_service_payments',
  // 2026-06-10: Merch checkout columns + SupportTxn.payfastPaymentId.
  // Safe to re-run — all IF NOT EXISTS.
  '20260610_merch_checkout_membership_revenue',
  // 2026-06-10: Purchase.artistId FK (for subscription/membership/marketplace rows)
  // + CreatorMembership.billingInterval + SupportTxn.payfastPaymentId.
  '20260610_purchase_artistid_membership_billing',
];

export async function GET(req: NextRequest) {
  // Auth — must provide CRON_SECRET either as header or query param
  const secret =
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret');

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = new Client({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });

  const log: string[] = [];

  try {
    await client.connect();

    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id                   VARCHAR(36)  PRIMARY KEY,
        checksum             VARCHAR(64)  NOT NULL,
        finished_at          TIMESTAMPTZ,
        migration_name       VARCHAR(255) NOT NULL,
        logs                 TEXT,
        rolled_back_at       TIMESTAMPTZ,
        started_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        applied_steps_count  INTEGER      NOT NULL DEFAULT 0
      );
    `);

    // 2. Baseline pre-existing migrations (record them as applied, no SQL)
    for (const name of BASELINE_MIGRATIONS) {
      const { rows } = await client.query(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`,
        [name]
      );
      if (rows.length === 0) {
        await client.query(
          `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES (gen_random_uuid()::text, 'baseline', now(), $1, 1)`,
          [name]
        );
        log.push(`baselined: ${name}`);
      } else {
        log.push(`already recorded: ${name}`);
      }
    }

    // 3. Apply new migrations in order
    for (const name of NEW_MIGRATIONS) {
      const { rows } = await client.query(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`,
        [name]
      );

      if (rows.length > 0) {
        log.push(`already applied: ${name}`);
        continue;
      }

      const sqlPath = path.join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql');
      let sql: string;
      try {
        sql = readFileSync(sqlPath, 'utf8');
      } catch {
        log.push(`WARN: SQL file not found for ${name} — skipping`);
        continue;
      }

      log.push(`applying: ${name} ...`);
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES (gen_random_uuid()::text, 'applied', now(), $1, 1)`,
        [name]
      );
      log.push(`done: ${name}`);
    }

    return NextResponse.json({ ok: true, log, timestamp: new Date().toISOString() });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[migrate] Failed:', message);
    return NextResponse.json({ ok: false, error: message, log }, { status: 500 });

  } finally {
    await client.end().catch(() => {});
  }
}
