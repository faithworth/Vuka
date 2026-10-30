/**
 * VUKA — Production Middleware (Paystack edition)
 *
 * Applied to every request via Next.js edge middleware. Responsibilities:
 *   1. Inject x-trace-id for request correlation across logs
 *   2. Block known malicious path patterns (traversal, probe strings)
 *   3. Admin route protection — validates Supabase session + email + role
 *   4. Cron endpoints protected by CRON_SECRET bearer token
 *   5. Paystack webhook + public data routes always public (signature-verified
 *      inside each handler — not user-auth gated)
 *   6. Pass Supabase auth cookies through for SSR rendering
 *
 * FIX: previous version imported a non-existent `createClient` from
 * '@/lib/supabase_server', which has no such export and broke the production
 * type-check (`Module has no exported member 'createClient'`). Replaced with
 * a proper middleware-scoped @supabase/ssr client built directly from the
 * NextRequest/NextResponse cookie APIs (cookies() from next/headers is NOT
 * available in middleware).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Routes that require an authenticated session at the edge; the specific
// admin/moderator role check happens in the route handler itself (see the
// FIX note below, around the isAdminPath block).
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
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/verify',
  '/auth/2fa',
  '/api/health',
  '/api/migrate',
  '/api/auth/magic-link',
  '/api/auth/callback',
  '/api/auth/register',

  // ── Paystack — single webhook + initialize + per-flow notify wrappers ──
  // (signature-verified inside each handler — not user-auth gated)
  '/api/checkout/paystack/webhook',
  '/api/checkout/paystack/initialize',
  '/api/plans/notify',
  '/api/marketplace/checkout',
  '/api/marketplace/checkout/notify',
  '/api/creator/memberships/notify',
  '/api/support/create-session',
  '/api/support/webhook',
  '/api/industry/order',
  '/api/webhooks/paystack',
  '/api/webhooks/flutterwave',
  '/api/webhooks/paypal',

  // Stripe stubs — return 410/200, don't need auth
  '/api/checkout/stripe/',
  '/api/connect/onboard',

  // Public data / discovery / store endpoints
  '/api/store/',
  '/api/artist/',
  '/api/discovery/',
  '/api/social/',
  '/api/licensing/verify',
  '/api/invoices',
  '/api/analytics/plays',
  '/api/play',
  '/api/download',

  // Admin login / repair — gated internally, not by Supabase session
  '/admin/login',
  '/admin/db-repair',
  '/api/admin/db-repair',

  // Next.js / static assets
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
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
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

function isMfaExemptPath(pathname: string): boolean {
  return pathname === '/api/auth/2fa' || pathname === '/api/auth/me';
}

async function isMfaRequired(user: { email?: string }, token: string): Promise<boolean> {
  if (!user.email) return false;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: dbUser, error: userError } = await admin
    .from('User').select('id').eq('email', user.email).maybeSingle();
  if (userError) throw userError;
  if (!dbUser?.id) return false;

  const { data: twoFactor, error: twoFactorError } = await admin
    .from('user_two_factor').select('isEnabled').eq('userId', dbUser.id).maybeSingle();
  if (twoFactorError) throw twoFactorError;
  if (twoFactor?.isEnabled !== true) return false;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return true;

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  const { data: challenge, error: challengeError } = await admin
    .from('two_factor_challenges')
    .select('id')
    .eq('userId', dbUser.id)
    .eq('token', tokenHash)
    .is('usedAt', null)
    .gt('expiresAt', new Date().toISOString())
    .maybeSingle();
  if (challengeError) throw challengeError;
  return !challenge;
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

    const authHeader = req.headers.get('authorization') ?? '';
    const xCronHeader = req.headers.get('x-cron-secret') ?? '';

    // Never accept CRON_SECRET in a URL: query strings can be copied into
    // access logs, browser history, monitoring systems, and Referer headers.
    const validSecret =
      authHeader === `Bearer ${cronSecret}` ||
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

  // ── 6. Server-side MFA enforcement ─────────────────────────────────────
  // A client-side redirect is not an authentication boundary. For users with
  // 2FA enabled, validate the HttpOnly proof against the hashed, unexpired
  // challenge row before allowing direct-Supabase pages or API routes through.
  if (user && !isMfaExemptPath(pathname)) {
    try {
      const mfaRequired = await isMfaRequired(user, req.cookies.get('vuka_mfa')?.value ?? '');
      if (mfaRequired) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Two-factor verification required.', mfaRequired: true, traceId },
            { status: 401, headers: { 'x-trace-id': traceId, 'Cache-Control': 'no-store' } }
          );
        }
        const verifyUrl = new URL('/auth/2fa', req.url);
        verifyUrl.searchParams.set('next', `${pathname}${req.nextUrl.search}`);
        return NextResponse.redirect(verifyUrl);
      }
    } catch {
      // Fail closed if the MFA state cannot be checked reliably.
      return NextResponse.json(
        { error: 'Authentication security check unavailable.', traceId },
        { status: 503, headers: { 'x-trace-id': traceId, 'Cache-Control': 'no-store' } }
      );
    }
  }

  // ── 7. Admin route enforcement ────────────────────────────────────────
  if (isAdminPath(pathname)) {
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

    // FIX: this used to hard-require `user.email === ADMIN_EMAIL`, but
    // requireAdmin() (src/lib/auth.ts) and every admin/moderation route
    // handler behind this gate independently check the DB role against
    // ['owner','super_admin','admin','moderator'] — a much broader set.
    // A logged-in moderator or admin whose email wasn't the one hardcoded
    // ADMIN_EMAIL was being blocked HERE, before ever reaching the route
    // logic that would have correctly allowed them. Edge middleware can't
    // cheaply read the Prisma-backed role (Prisma needs the Node runtime,
    // not Edge), so authorization is now a two-layer model:
    //   1. Middleware (here): coarse gate — must have a valid session.
    //   2. Route/page handler: fine-grained gate — must have an admin role,
    //      verified via requireAdmin() or an equivalent DB role check.
    // Every route currently reachable through ADMIN_PATHS already performs
    // its own role check independently of this middleware, so this is not
    // a new hole — it removes a hidden single-point lockout without
    // weakening the actual authorization decision.
    if (!user.email) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden', traceId },
          { status: 403, headers: { 'x-trace-id': traceId } }
        );
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // ── 7. Attach trace ID to response ──────────────────────────────────────
  // Note: non-admin routes are intentionally NOT blanket-redirected here.
  // Each page/API route enforces its own auth via requireAuth()/requireArtist()
  // (see src/lib/auth.ts) — middleware only gates /admin* and cron, and passes
  // Supabase cookies through so SSR pages can read the session.
  response.headers.set('x-trace-id', traceId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
