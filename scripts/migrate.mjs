#!/usr/bin/env node
// scripts/migrate.mjs — runs during Vercel build before next build
// Baselines existing migrations then applies any new migrations in order.

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Migrations that existed before this script was introduced — baseline only, no SQL to run
const EXISTING_MIGRATIONS = [
  'phase2_creator_economy',
  'phase3_social_engine',
  'phase4_final_hardening',
  'phase5_distribution_engine',
  'phase5_exclusive_content',
  'phase5_status_history',
];

// New migrations to apply in order — each must have a migration.sql file
const NEW_MIGRATIONS = [
  '20250528_fix_schema_field_mismatches',
  '20250528_add_bank_account_payment_fields',
  '20250528_fix_pageview_analytics_fields',
  '20250528_fix_geography_unique',
  '20250528_fix_analytics_daily_rollup',
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  // 1. Ensure _prisma_migrations table exists
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

  // 2. Baseline all pre-existing migrations (idempotent)
  for (const name of EXISTING_MIGRATIONS) {
    const { rows } = await client.query(
      `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`, [name]
    );
    if (rows.length === 0) {
      await client.query(`
        INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'baseline', now(), $1, 1)
      `, [name]);
      console.log(`  baselined: ${name}`);
    } else {
      console.log(`  already recorded: ${name}`);
    }
  }

  // 3. Apply each new migration if not already done
  for (const migrationName of NEW_MIGRATIONS) {
    const { rows: already } = await client.query(
      `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`, [migrationName]
    );

    if (already.length > 0) {
      console.log(`  already applied: ${migrationName} — skipping.`);
    } else {
      const sqlPath = path.join(__dirname, `../prisma/migrations/${migrationName}/migration.sql`);
      const sql = readFileSync(sqlPath, 'utf8');
      console.log(`  applying: ${migrationName} ...`);
      await client.query(sql);
      await client.query(`
        INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'applied', now(), $1, 1)
      `, [migrationName]);
      console.log(`  done: ${migrationName}`);
    }
  }

  console.log('Migration complete.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
