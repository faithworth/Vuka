/**
 * GET /api/health
 *
 * Deep health check endpoint for load balancers, uptime monitors, and Vercel
 * deployment probes. Checks every external dependency.
 *
 * Returns 200 if all critical deps are healthy, 503 if any are degraded.
 * Returns 200 with degraded:true if non-critical deps are degraded (so LB
 * doesn't pull healthy instances just because Resend has a hiccup).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { r2 } from '@/lib/r2';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/logger';

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message.split('\n')[0] : 'DB error' };
  }
}

async function checkR2(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await r2.send(new HeadBucketCommand({ Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vuka-audio' }));
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message.split('\n')[0] : 'R2 error' };
  }
}

async function checkEnv(): Promise<CheckResult> {
  const required = [
    'DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'CLOUDFLARE_R2_ACCOUNT_ID',
    'CLOUDFLARE_R2_BUCKET_NAME', 'PAYFAST_MERCHANT_ID', 'STRIPE_SECRET_KEY',
    'CRON_SECRET',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    return { ok: false, latencyMs: 0, error: `Missing env: ${missing.join(', ')}` };
  }
  return { ok: true, latencyMs: 0 };
}

export async function GET() {
  const startTotal = Date.now();

  const [db, r2Check, env] = await Promise.allSettled([
    checkDatabase(),
    checkR2(),
    checkEnv(),
  ]);

  const results = {
    database:    db.status    === 'fulfilled' ? db.value    : { ok: false, latencyMs: 0, error: 'Promise rejected' },
    storage:     r2Check.status === 'fulfilled' ? r2Check.value : { ok: false, latencyMs: 0, error: 'Promise rejected' },
    environment: env.status   === 'fulfilled' ? env.value   : { ok: false, latencyMs: 0, error: 'Promise rejected' },
  };

  const criticalOk = results.database.ok && results.environment.ok;
  const allOk = criticalOk && results.storage.ok;

  const payload = {
    status: allOk ? 'healthy' : criticalOk ? 'degraded' : 'unhealthy',
    version: process.env.npm_package_version ?? '0.0.0',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    totalLatencyMs: Date.now() - startTotal,
    checks: results,
  };

  if (!criticalOk) {
    logger.error('[health] Critical dependency failure', { checks: results });
  }

  return NextResponse.json(payload, { status: criticalOk ? 200 : 503 });
}
