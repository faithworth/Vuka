export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/health
 *
 * Public health check endpoint for:
 *  - Better Uptime monitors
 *  - Vercel deployment verification
 *  - Load balancer health probes
 *  - Cloudflare health checks
 *
 * Returns:
 *  200 { status: "ok", db: "ok", ts: "..." }       — healthy
 *  503 { status: "degraded", db: "error", ... }    — unhealthy
 */
export async function GET() {
  const start = Date.now();
  const checks: Record<string, string> = {};

  // ── Database check ───────────────────────────────────────────
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }

  const healthy = Object.values(checks).every((v) => v === 'ok');
  const durationMs = Date.now() - start;

  const body = {
    status: healthy ? 'ok' : 'degraded',
    checks,
    durationMs,
    ts: new Date().toISOString(),
    region: process.env.VERCEL_REGION ?? 'unknown',
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
  };

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache',
      'X-Health-Status': healthy ? 'ok' : 'degraded',
    },
  });
}
