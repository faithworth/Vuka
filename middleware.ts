/**
 * VUKA — Production Middleware
 *
 * Applied to every request via Next.js edge middleware. Responsibilities:
 *   1. Inject x-trace-id for request correlation across logs
 *   2. Block known malicious path patterns (traversal, probe strings)
 *   3. Admin route protection — validates Supabase session + email check
 *   4. Cron endpoints protected by CRON_SECRET bearer token
 *   5. Payment webhooks (Paystack, PayPal) always public — signature-verified
 *      inside each handler, never gated here
 *   6. Pass Supabase auth cookies through for SSR rendering
 *
 * Security: Admin check uses server-only ADMIN_EMAIL env var.
 * NEXT_PUBLIC_ADMIN_EMAIL has been permanently removed — it exposed the
 * admin email in the JS bundle, visible to every visitor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Server-only — never expose this via NEXT_PUBLIC_* prefix
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Routes that require ADMIN_EMAIL + valid session to access
const ADMIN_PATHS = [
  '/admin',
  '/api/admin',
  '/api/payouts/admin',
  '/api/moderation/admin',
  '/api/moderation/queue',
  '/api/moderation/reports/',
  '/api/moderation/dmca',
  '/api/moderation/verify',
  '/api/analytics/platform',
] as const;

// Separately gated by CRON_SECRET bearer token (not Supabase session)
const CRON_PATHS = [
  '/api/workers/cron',
  '/api/cron/expire-plans',
  '/api/cron/referral-rewards',
  '/api/cron/campaign-deadlines',
] as const;

// Routes that bypass Supabase session validation entirely
const PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/verify',
  '/api/health',
  '/api/migrate',
  '/api/auth/magic-link',
  '/api/auth/callback',
  '/api/auth/register',
  '/api/redownload',

  // ── Paystack (signature-verified inside each handler) ─────────────────
  '/api/checkout/paystack/webhook',
  '/api/checkout/paystack/initialize',
  '/api/plans/notify',
  '/api/marketplace/checkout',

  // ── PayPal (signature-verified inside each handler) ───────────────────
  '/api/webhooks/paypal',
  '/api/checkout/paypal/create-order',
  '/api/checkout/paypal/capture-order',

  // ── Public content ────────────────────────────────────────────────────
  '/api/beats/public',
  '/api/releases/public',
  '/api/artists/public',
  '/api/search',
  '/api/discover',
  '/api/feed',
  '/sitemap.xml',
  '/robots.txt',
] as const;

// Path patterns that are always blocked (security probes)
const BLOCKED_PATTERNS = [
  /\.\.[\\/]/,           // path traversal
  /\.(env|git|htaccess)/, // common probe targets
  /\/wp-/i,              // WordPress probes
  /\/(php|asp|aspx|jsp)$/i, // wrong-stack probes
  /\/xmlrpc\.php/i,
  /__pycache__/,
  /\/etc\/passwd/,
] as const;

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((p) => pathname.startsWith(p));
}

function isCronPath(pathname: string): boolean {
  return CRON_PATHS.some((p) => pathname.startsWith(p));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isBlocked(pathname: string): boolean {
  return BLOCKED_PATTERNS.some((re) => re.test(pathname));
}

function generateTraceId(): string {
  return `vuka_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const traceId = generateTraceId();

  // ── 1. Block malicious patterns ────────────────────────────────────────
  if (isBlocked(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  // ── 2. Cron endpoints — CRON_SECRET bearer token only ─────────────────
  if (isCronPath(pathname)) {
    const cronSecret   = process.env.CRON_SECRET;
    const authHeader   = req.headers.get('authorization') ?? '';
    const providedSecret = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.headers.get('x-cron-secret') ?? '';

    if (!cronSecret || providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Unauthorized', traceId },
        { status: 401, headers: { 'x-trace-id': traceId } }
      );
    }

    const res = NextResponse.next();
    res.headers.set('x-trace-id', traceId);
    return res;
  }

  // ── 3. Public paths — pass through with trace ID ──────────────────────
  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set('x-trace-id', traceId);
    return response;
  }

  // ── 4. Admin paths — require valid session + matching ADMIN_EMAIL ──────
  if (isAdminPath(pathname)) {
    // Build a middleware-scoped Supabase client (cookies() is not available here)
    let response = NextResponse.next({
      request: { headers: req.headers },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value }) =>
              req.cookies.set(name, value)
            );
            response = NextResponse.next({ request: { headers: req.headers } });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized', traceId },
          { status: 401, headers: { 'x-trace-id': traceId } }
        );
      }
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Email must match server-only ADMIN_EMAIL (never NEXT_PUBLIC_ADMIN_EMAIL)
    if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden', traceId },
          { status: 403, headers: { 'x-trace-id': traceId } }
        );
      }
      return NextResponse.redirect(new URL('/', req.url));
    }

    response.headers.set('x-trace-id', traceId);
    return response;
  }

  // ── 5. All other paths — pass through with trace ID ───────────────────
  // Individual pages and API routes enforce their own auth via
  // requireAuth() / requireArtist() in src/lib/auth.ts.
  const response = NextResponse.next();
  response.headers.set('x-trace-id', traceId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)).*)',
  ],
};
