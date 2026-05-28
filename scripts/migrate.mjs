#!/usr/bin/env node
// scripts/migrate.mjs — runs during Vercel build before next build
// Baselines existing migrations then applies the new field-fix SQL.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false },
});

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

async function sql(query) {
  const { data, error } = await supabase.rpc('exec_sql', { query });
  if (error) throw new Error(`SQL error: ${error.message}\nQuery: ${query.slice(0, 120)}`);
  return data;
}

// Supabase JS client doesn't expose raw SQL — use the REST /rest/v1/rpc or
// the pg connection string via DATABASE_URL instead.
// Fall back to DATABASE_URL with the `postgres` package installed inline.

import { execSync } from 'child_process';

// Install pg at build time if not present (it's tiny, ~3MB)
try {
  await import('pg');
} catch {
  console.log('Installing pg...');
  execSync('npm install pg --no-save', { stdio: 'inherit' });
}

const { default: pg } = await import('pg');
const { Client } = pg;

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
} finally {
  await client.end();
}
