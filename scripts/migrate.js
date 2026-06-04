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

// In development, use migrate dev (creates migration files)
// In production/CI, use migrate deploy (applies existing migrations only)
const command = isDev && !isCI
  ? 'npx prisma migrate dev --skip-seed'
  : 'npx prisma migrate deploy';

console.log(`[migrate] Running: ${command}`);
console.log(`[migrate] Environment: ${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'}`);

try {
  execSync(command, {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Ensure Prisma uses DIRECT_URL for migrations (bypasses PgBouncer)
      DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  });
  console.log('[migrate] Migrations completed successfully');
} catch (err) {
  console.error('[migrate] Migration failed:', err.message);
  // In CI/production — fail the build on migration error
  if (isCI) {
    process.exit(1);
  }
  // In dev — warn but continue (allow building with schema drift for local debugging)
  console.warn('[migrate] Continuing despite migration failure (dev mode)');
}
