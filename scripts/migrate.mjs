#!/usr/bin/env node
// scripts/migrate.mjs — runs during Vercel build before next build
// Baselines existing migrations then applies the new field-fix SQL.

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXISTING_MIGRATIONS = [
  'phase2_creator_economy',
  'phase3_social_engine',
  'phase4_final_hardening',
  'phase5_distribution_engine',
  'phase5_exclusive_content',
  'phase5_status_history',
];

const NEW_MIGRATION = '20250528_fix_schema_field_mismatches';
const NEW_SQL = readFileSync(
  path.join(__dirname, `../prisma/migrations/${NEW_MIGRATION}/migration.sql`),
  'utf8'
);

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

  // 3. Apply new migration if not already done
  const { rows: already } = await client.query(
    `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1`, [NEW_MIGRATION]
  );

  if (already.length > 0) {
    console.log(`  already applied: ${NEW_MIGRATION} — skipping.`);
  } else {
    console.log(`  applying: ${NEW_MIGRATION} ...`);
    await client.query(NEW_SQL);
    await client.query(`
      INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, applied_steps_count)
      VALUES (gen_random_uuid()::text, 'field_fix', now(), $1, 1)
    `, [NEW_MIGRATION]);
    console.log(`  done: ${NEW_MIGRATION}`);
  }

  console.log('Migration complete.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
