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
