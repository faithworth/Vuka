/**
 * POST /api/migrate
 *
 * Runs pending SQL migrations in order.
 * Protected by CRON_SECRET — never expose publicly.
 *
 * Add new migrations to the MIGRATIONS array in chronological order.
 * Each migration is idempotent (uses IF NOT EXISTS / IF EXISTS guards).
 *
 * Usage:
 *   curl -X POST http://localhost:3000/api/migrate \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Migration registry — add new ones at the bottom ──────────────────────
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id:  'paypal_integration',
    sql: `
      -- Purchase: PayPal tracking fields
      ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT NOT NULL DEFAULT 'paystack';
      ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "paymentCurrency" TEXT NOT NULL DEFAULT 'ZAR';
      ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "paymentAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0;
      ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "artistEarnings"  DOUBLE PRECISION NOT NULL DEFAULT 0;

      -- Purchase: drop obsolete distributionRelease FK
      ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "distributionReleaseId";
      DROP INDEX IF EXISTS "Purchase_distributionReleaseId_idx";

      -- PayoutRequest: method + PayPal fields
      ALTER TABLE "PayoutRequest" ADD COLUMN IF NOT EXISTS "method"             TEXT NOT NULL DEFAULT 'bank_transfer';
      ALTER TABLE "PayoutRequest" ADD COLUMN IF NOT EXISTS "paypalEmail"        TEXT;
      ALTER TABLE "PayoutRequest" ADD COLUMN IF NOT EXISTS "notes"              TEXT NOT NULL DEFAULT '';
      ALTER TABLE "PayoutRequest" ADD COLUMN IF NOT EXISTS "paystackReference"  TEXT;

      -- Artist: top-level PayPal email
      ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "paypalEmail" TEXT;

      -- Clean up Flutterwave method values
      UPDATE "ArtistPayout" SET "method" = 'bank_transfer' WHERE "method" = 'flutterwave';

      -- Indexes
      CREATE INDEX IF NOT EXISTS "Purchase_paymentProvider_idx" ON "Purchase"("paymentProvider");
      CREATE INDEX IF NOT EXISTS "Purchase_paymentCurrency_idx" ON "Purchase"("paymentCurrency");
      CREATE INDEX IF NOT EXISTS "PayoutRequest_method_idx"     ON "PayoutRequest"("method");
      CREATE INDEX IF NOT EXISTS "PayoutRequest_status_idx"     ON "PayoutRequest"("status");
    `,
  },
  {
    id:  'phase13_ticket_gate_security',
    sql: `
      -- Restores the anti-fraud columns for event check-in that were missing
      -- from ticket_purchases. Additive/non-destructive.
      ALTER TABLE "ticket_purchases"
        ADD COLUMN IF NOT EXISTS "qrSignature"       TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "checkedInAt"       TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "checkedInByUserId" TEXT,
        ADD COLUMN IF NOT EXISTS "checkInDeviceInfo" TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    id:  'stories_and_reels',
    sql: `
      CREATE TABLE IF NOT EXISTS "Story" (
        "id"        TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "artistId"  TEXT NOT NULL,
        "mediaUrl"  TEXT NOT NULL,
        "mediaType" TEXT NOT NULL DEFAULT 'image',
        "caption"   TEXT NOT NULL DEFAULT '',
        "viewCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "Story_artistId_expiresAt_idx" ON "Story"("artistId", "expiresAt");
      CREATE INDEX IF NOT EXISTS "Story_expiresAt_idx" ON "Story"("expiresAt");
      DO $$ BEGIN
        ALTER TABLE "Story" ADD CONSTRAINT "Story_artistId_fkey"
          FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS "StoryView" (
        "id"       TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "storyId"  TEXT NOT NULL,
        "userId"   TEXT NOT NULL,
        "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "StoryView_storyId_userId_key" ON "StoryView"("storyId", "userId");
      CREATE INDEX IF NOT EXISTS "StoryView_storyId_idx" ON "StoryView"("storyId");
      DO $$ BEGIN
        ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey"
          FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS "Reel" (
        "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "artistId"     TEXT NOT NULL,
        "videoUrl"     TEXT NOT NULL,
        "thumbnailUrl" TEXT NOT NULL DEFAULT '',
        "caption"      TEXT NOT NULL DEFAULT '',
        "likeCount"    INTEGER NOT NULL DEFAULT 0,
        "commentCount" INTEGER NOT NULL DEFAULT 0,
        "repostCount"  INTEGER NOT NULL DEFAULT 0,
        "viewCount"    INTEGER NOT NULL DEFAULT 0,
        "isPublished"  BOOLEAN NOT NULL DEFAULT true,
        "publishedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Reel_artistId_isPublished_publishedAt_idx" ON "Reel"("artistId", "isPublished", "publishedAt");
      CREATE INDEX IF NOT EXISTS "Reel_isPublished_publishedAt_idx" ON "Reel"("isPublished", "publishedAt");
      DO $$ BEGIN
        ALTER TABLE "Reel" ADD CONSTRAINT "Reel_artistId_fkey"
          FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `,
  },
];

export async function POST(req: NextRequest) {
  // Auth: CRON_SECRET bearer token
  const secret   = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') ?? '';
  const provided   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { id: string; status: 'ok' | 'error'; error?: string }[] = [];

  for (const migration of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(migration.sql);
      results.push({ id: migration.id, status: 'ok' });
    } catch (err) {
      results.push({
        id:     migration.id,
        status: 'error',
        error:  err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.status === 'ok');

  return NextResponse.json(
    { ok: allOk, migrations: results },
    { status: allOk ? 200 : 500 }
  );
}

// GET: list registered migrations (auth required)
export async function GET(req: NextRequest) {
  const secret     = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') ?? '';
  const provided   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    migrations: MIGRATIONS.map((m) => ({ id: m.id })),
    count:      MIGRATIONS.length,
  });
}
