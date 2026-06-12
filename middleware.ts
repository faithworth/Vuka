// middleware.ts — Vuka auth middleware (Paystack edition)
// PayFast ITN paths removed; Paystack webhook paths added.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase_server';

const PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/verify',
  '/api/auth/magic-link',
  '/api/auth/callback',
  '/api/auth/register',
  '/api/health',
  '/api/store/beats',
  '/api/store/releases',
  '/api/store/samples',
  '/api/store/videos',
  '/api/store/artists',
  '/api/discovery/browse',
  '/api/discovery/search',
  '/api/discovery/trending',
  '/api/discovery/recommendations',
  '/api/play',
  '/api/download',
  '/api/social/feed',
  '/api/social/posts',
  '/api/social/comments',
  '/api/social/likes',
  '/api/artist',
  '/api/analytics/plays',
  // ── Paystack webhooks (public — signature-verified inside the handler) ──
  '/api/checkout/paystack/webhook',
  '/api/checkout/paystack/initialize',
  '/api/plans/notify',
  '/api/support/create-session',
  '/api/support/webhook',
  '/api/marketplace/checkout',
  '/api/marketplace/checkout/notify',
  '/api/creator/memberships/notify',
  '/api/webhooks/paystack',
  '/api/industry/order',
  // ── Misc public ──
  '/api/licensing/verify',
  '/api/invoices',
  '/api/workers/cron',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(p =>
    pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')
  );
  if (isPublic) return NextResponse.next();

  const supabase = createClient(req);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
