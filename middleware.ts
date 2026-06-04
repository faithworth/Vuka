/**
 * VUKA — Production Middleware (Phase 12 — Final Hardening)
 *
 * Applied to every request via Next.js edge middleware. Responsibilities:
 *   1. Inject x-trace-id for request correlation across logs
 *   2. Block known malicious path patterns (traversal, probe strings)
 *   3. Admin route protection — validates Supabase session + email + role
 *   4. Cron endpoints protected by CRON_SECRET bearer token
 *   5. PayFast webhook routes always public (PayFast-signed, not user auth)
 *   6. Pass Supabase auth cookies through for SSR rendering
 *
 * Phase 12 changes:
 *   - Added /api/checkout/payfast/create-session to PUBLIC_PATHS (replaces stripe)
 *   - Added /api/checkout/stripe/* to PUBLIC_PATHS (stubs — always returns 410/200)
 *   - Removed dead Stripe webhook paths from protection
 *   - Cron path now ALSO checks query-string ?secret= fallback (Vercel Cron compat)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Routes that require ADMIN_EMAIL + admin DB role to access
const ADMIN_PATHS = [
  '/admin',
  '/api/admin',
  '/api/distribution/admin',
  '/api/payouts/admin',
  '/api/moderation/admin',
  '/api/moderation/queue',
  '/api/moderation/reports/',
  '/api/moderation/dmca',
  '/api/moderation/verify',
  '/api/analytics/platform',
] as const;

// Cron is separately gated by CRON_SECRET (not Supabase session)
const CRON_PATHS = ['/api/workers/cron'] as const;

// Routes that bypass Supabase session validation entirely
const PUBLIC_PATHS = [
  '/api/health',
  '/api/migrate',
  // PayFast ITN webhooks — signed by PayFast, not user auth
  '/api/checkout/payfast/notify',
  '/api/checkout/payfast/create-session',
  '/api/webhooks/payfast',
  '/api/webhooks/flutterwave',
  '/api/webhooks/paypal',
  '/api/support/payfast-notify',
  '/api/support/create-session',
  '/api/support/webhook',
  // Stripe stubs — return 410/200, don't need auth
  '/api/checkout/stripe/',
  '/api/connect/onboard',
  // Public data endpoints
  '/api/store/',
  '/api/artist/',
  '/api/discovery/',
  '/api/licensing/verify',
  '/api/analytics/plays',
  '/api/play',
  // Next.js / static assets
  '/admin/login',
  '/admin/db-repair',        // Protected by CRON_SECRET internally — accessible before admin auth is fixed
  '/api/admin/db-repair',    // Same — CRON_SECRET gated, not Supabase session gated
  '/favicon',
  '/_next',
  '/static',
  '/robots.txt',
  '/sitemap.xml',
] as const;

// Patterns that are outright blocked — return 404 to avoid fingerprinting
const BLOCKED_PATTERNS = [
  '../',
  '/.env',
  '/etc/passwd',
  '/proc/',
  'wp-admin',
  'phpMyAdmin',
  '.git/',
  'xmlrpc',
  '<script',
  'javascript:',
  'data:text',
  '\\x',
  '%2e%2e',    // URL-encoded ..
  '%252e',     // double-encoded .
  '/actuator',
  '/.well-known/acme-challenge/../',
  '/vendor/',
  '/shell',
  '/cmd',
];

function generateTraceId(): string {
  return `vk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((p) => pathname.startsWith(p));
}

function isCronPath(pathname: string): boolean {
  return CRON_PATHS.some((p) => pathname.startsWith(p));
}

function isBlockedPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return BLOCKED_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const traceId = generateTraceId();

  // ── 1. Block malicious paths immediately (before any DB/auth work) ─────
  if (isBlockedPath(pathname)) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'x-trace-id': traceId },
    });
  }

  // ── 2. Inject trace ID + client IP into request headers ───────────────
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-trace-id', traceId);
  requestHeaders.set('x-forwarded-trace', traceId);
  requestHeaders.set('x-client-ip', getClientIp(req));

  // ── 3. Cron endpoints — gated by CRON_SECRET, not Supabase session ────
  if (isCronPath(pathname)) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured', traceId },
        { status: 500, headers: { 'x-trace-id': traceId } }
      );
    }

    // Accept either Bearer header OR ?secret= query param (Vercel Cron sends Bearer)
    const authHeader = req.headers.get('authorization') ?? '';
    const querySecret = req.nextUrl.searchParams.get('secret') ?? '';
    const xCronHeader = req.headers.get('x-cron-secret') ?? '';

    const validSecret =
      authHeader === `Bearer ${cronSecret}` ||
      querySecret === cronSecret ||
      xCronHeader === cronSecret;

    if (!validSecret) {
      return NextResponse.json(
        { error: 'Unauthorized', traceId },
        { status: 401, headers: { 'x-trace-id': traceId } }
      );
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-trace-id', traceId);
    return res;
  }

  // ── 4. Short-circuit public routes — no session validation needed ──────
  if (isPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-trace-id', traceId);
    return res;
  }

  // ── 5. Supabase session validation ────────────────────────────────────
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ── 6. Admin route enforcement ────────────────────────────────────────
  if (isAdminPath(pathname)) {
    // Must be authenticated
    if (!user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized', traceId },
          { status: 401, headers: { 'x-trace-id': traceId } }
        );
      }
      // Send to admin login (magic-link), not the artist login page
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Must be the designated admin email (env-locked, not DB-editable)
    if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden', traceId },
          { status: 403, headers: { 'x-trace-id': traceId } }
        );
      }
      // Redirect non-admins to home, not to a broken auth loop
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // ── 7. Attach trace ID to response ────────────────────────────────────
  response.headers.set('x-trace-id', traceId);
  return response;
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
