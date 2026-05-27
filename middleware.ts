/**
 * VUKA — Production Middleware (Phase 5 Final)
 *
 * Applied to every request. Responsibilities:
 *   1. Inject trace ID (x-trace-id) for request correlation in logs
 *   2. Block known malicious patterns (path traversal, SQL probe strings)
 *   3. Admin route protection — validates Supabase session server-side
 *   4. Pass Supabase auth cookies through for SSR
 *
 * NOT responsible for per-route rate limiting (done in route handlers).
 * NOT responsible for CORS (handled in next.config.js headers).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

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
];

const PUBLIC_PATHS = [
  '/api/health',
  '/api/workers/cron',
  '/api/checkout/payfast/notify',
  '/api/checkout/stripe/webhook',
  '/api/support/payfast-notify',
  '/api/store/',
  '/api/artist/',
  '/api/discovery/',
  '/api/licensing/verify',
  '/api/analytics/plays',
  '/favicon',
  '/_next',
  '/static',
  '/robots.txt',
  '/sitemap.xml',
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

function isBlockedPath(pathname: string): boolean {
  const blocked = [
    '..', '/.env', '/etc/passwd', '/proc/',
    'wp-admin', 'phpMyAdmin', '.git/', 'xmlrpc',
    '<script', 'javascript:', 'data:text',
  ];
  return blocked.some((b) => pathname.toLowerCase().includes(b.toLowerCase()));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const traceId = generateTraceId();

  if (isBlockedPath(pathname)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-trace-id', traceId);
  requestHeaders.set('x-forwarded-trace', traceId);

  if (isPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-trace-id', traceId);
    return res;
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (isAdminPath(pathname)) {
    if (!user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/auth/login', req.url));
    }

    if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  response.headers.set('x-trace-id', traceId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
