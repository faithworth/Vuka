# How to Apply Phase 5 to Your Vuka Codebase
# =============================================
# This guide tells you exactly which file goes where.
# Apply in the order listed.

## STEP 1: Replace root config files

REPLACE these files at your project root:
  - next.config.js          ← use vuka-phase5/next.config.js
  - middleware.ts            ← use vuka-phase5/middleware.ts (place at root, not src/)
  - vercel.json              ← use vuka-phase5/vercel.json
  - package.json             ← use vuka-phase5/package.json
  - tsconfig.json            ← use vuka-phase5/tsconfig.json

## STEP 2: Replace the Prisma schema

REPLACE:
  prisma/schema.prisma       ← use vuka-phase5/prisma/schema.prisma

## STEP 3: Add the migration

ADD (do not replace existing migrations):
  prisma/migrations/phase4_final_hardening/migration.sql

## STEP 4: Replace/Add library files

REPLACE OR ADD all files in src/lib/:
  src/lib/logger.ts          ← NEW — structured logger
  src/lib/audit.ts           ← NEW — audit log
  src/lib/rateLimit.ts       ← NEW — DB rate limiter
  src/lib/env.ts             ← NEW — env validation
  src/lib/emails.ts          ← REPLACE — fixes 2% fee bug + new notifications
  src/lib/social.ts          ← REPLACE — removes 500 follower cap + bug fixes
  src/lib/moderation.ts      ← REPLACE — SSRF fix + audit wiring

ADD the workers directory:
  src/lib/workers/jobs.ts    ← NEW — background job implementations

## STEP 5: Replace API routes

REPLACE these routes:
  src/app/api/checkout/stripe/webhook/route.ts   ← REPLACE (idempotency + fee fix)
  src/app/api/checkout/payfast/notify/route.ts   ← REPLACE (idempotency + fee fix)

ADD these routes:
  src/app/api/health/route.ts                    ← NEW — health check
  src/app/api/workers/cron/route.ts              ← REPLACE (full implementation)

## STEP 6: Create .env.local from .env.example

Copy .env.example to .env.local and fill in real values.

## STEP 7: Run migration locally (optional)

npx prisma migrate deploy

## STEP 8: Test build locally

npm run build

## STEP 9: Deploy to Vercel

git add -A && git commit -m "Phase 5: Production hardening" && git push
