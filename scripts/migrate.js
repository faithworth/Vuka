#!/usr/bin/env node
/**
 * scripts/migrate.js
 *
 * Runs all pending database migrations during Vercel build.
 * Invoked via buildCommand in vercel.json:
 *   "node scripts/migrate.js && npx prisma generate && next build"
 *
 * Same migration list as src/app/api/migrate/route.ts — keep both in sync
 * when adding new migrations.
 *
 * Uses pg directly (already in node_modules via @prisma/client deps).
 * Fully idempotent — already-applied migrations are skipped silently.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const BASELINE_MIGRATIONS = [
  'phase2_creator_economy',
  'phase3_social_engine',
  'phase4_final_hardening',
  'phase5_distribution_engine',
  'phase5_exclusive_content',
  'phase5_status_history',
];

const NEW_MIGRATIONS = [
  '20250528_fix_schema_field_mismatches',
  '20250528_add_bank_account_payment_fields',
  '20250528_fix_pageview_analytics_fields',
  '20250528_fix_geography_unique',
  '20250528_fix_analytics_daily_rollup',
  '20250529_fix_schema_missing_fields',
  '20250529_fix_spamsignal_messaging',
  '20250529_fix_moderation_schema_fields',
  // 2025-05-31: User suspension fields — required by auth/me route
  '20250531_user_suspension_and_roles',
];

async function run() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[migrate] No DATABASE_URL — skipping migrations (local build without DB)');
    process.exit(0);
  }

  const client = new Client({ connectionString });
  const log = [];

  try {
    await client.connect();
    console.log('[migrate] Connected to database');

    // Ensure migrations tracking table exists
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

    // Baseline pre-existing migrations
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

    // Apply new migrations in order
    for (const name of NEW_MIGRATIONS) {
      const { rows } = await client.query(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`,
        [name]
      );

      if (rows.length > 0) {
        log.push(`already applied: ${name}`);
        continue;
      }

      const sqlPath = path.join(__dirname, '..', 'prisma', 'migrations', name, 'migration.sql');
      let sql;
      try {
        sql = fs.readFileSync(sqlPath, 'utf8');
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

    console.log('[migrate] Results:\n' + log.map(l => '  ' + l).join('\n'));
    console.log('[migrate] Complete');

  } catch (err) {
    console.error('[migrate] FAILED:', err.message);
    // Exit 1 to fail the Vercel build if migration errors — prevents deploying
    // code against a DB that doesn't have the required schema.
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run();
