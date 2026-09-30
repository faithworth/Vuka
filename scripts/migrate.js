/**
 * VUKA — Production Migration Script
 * Phase 11 — Infrastructure & Deployment
 *
 * Called by Vercel build command: node scripts/migrate.js
 * Runs Prisma migrations in CI/CD before the Next.js build.
 *
 * Uses DIRECT_URL (not DATABASE_URL) for migrations — bypasses PgBouncer
 * which doesn't support DDL statements in transaction mode.
 */

const { execSync } = require('child_process');

const isDev = process.env.NODE_ENV === 'development';
const isCI  = process.env.CI === 'true' || process.env.VERCEL === '1';

// Skip migrations if no DATABASE_URL (e.g. initial Vercel project setup)
if (!process.env.DATABASE_URL) {
  console.log('[migrate] DATABASE_URL not set — skipping migrations');
  process.exit(0);
}

const env = {
  ...process.env,
  // Ensure Prisma uses DIRECT_URL for migrations (bypasses PgBouncer)
  DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
};

// In production/CI: recover migrations that are recorded as rolled back.
// Prisma blocks every later migration while one migration is left in a failed
// state. These historical migrations are already represented by the live schema,
// so they must be marked rolled back before migrate deploy can continue.
// If a migration is already applied/clean, the resolve command simply fails and
// we continue.
if (isCI) {
  const migrationsToResolve = [
    '20250527_platform_settings_and_email',
    '20260604_phase12_cleanup',
    '20260604_role_repair',
    '20260612_paystack_migration',
    'phase10b_paystack_recipient',
  ];
  for (const name of migrationsToResolve) {
    try {
      console.log(`[migrate] Clearing historical rolled-back migration: ${name}`);
      execSync(`npx prisma migrate resolve --rolled-back "${name}"`, { stdio: 'inherit', env });
    } catch {
      // Ignore — the migration may already be clean/applied or not present.
    }
  }
}

// In development, use migrate dev (creates migration files)
// In production/CI, use migrate deploy (applies existing migrations only)
const command = isDev && !isCI
  ? 'npx prisma migrate dev --skip-seed'
  : 'npx prisma migrate deploy';

console.log(`[migrate] Running: ${command}`);
console.log(`[migrate] Environment: ${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'}`);

try {
  execSync(command, { stdio: 'inherit', env });
  console.log('[migrate] Migrations completed successfully');
} catch (err) {
  console.error('[migrate] Migration failed:', err.message);
  if (isCI) {
    process.exit(1);
  }
  console.warn('[migrate] Continuing despite migration failure (dev mode)');
}
