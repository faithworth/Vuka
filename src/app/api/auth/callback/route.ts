import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';
import { sendWelcomeArtist } from '@/lib/emails';
import { registerDeviceSession, getIpFromHeaders } from '@/lib/security/deviceSessions';
import { user2FAEnabled } from '@/lib/security/twoFactor';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  // roleParam is ONLY used for brand-new users who just registered
  const roleParam = searchParams.get('role') || 'fan';
  // FIX: this was read nowhere before — Google OAuth signups from a
  // referral link (?ref=xxx passed through from /auth/register) silently
  // never counted toward the referrer's goal, with no error surfaced
  // anywhere. The email/password path already validates+writes this via
  // /api/auth/register; this brings the OAuth path to parity with it.
  const refParam = searchParams.get('ref') || '';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', req.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error('[auth/callback] Session exchange failed:', error?.message);
    return NextResponse.redirect(new URL('/auth/login?error=oauth_failed', req.url));
  }

  const { email, user_metadata } = data.user;
  const name = user_metadata?.full_name || user_metadata?.name || email?.split('@')[0] || 'User';

  // Is this the designated admin/owner?
  const isAdminEmail = ADMIN_EMAIL && email === ADMIN_EMAIL;

  let resolvedRedirect = '/fan';

  try {
    let dbUser = await prisma.user.findUnique({
      where: { email: email! },
      include: { artist: true, industryUser: true },
    });

    if (!dbUser) {
      // Brand-new user — assign role from registration param
      const assignedRole = isAdminEmail ? 'owner' : roleParam;

      // Validate the referral code before trusting it — don't hard-fail
      // signup if it's invalid/stale, just don't attribute the referral.
      // Mirrors the same check in /api/auth/register.
      let validatedRef: string | undefined;
      if (refParam) {
        const referrer = await prisma.user.findUnique({ where: { referralCode: refParam } });
        if (referrer) validatedRef = refParam;
      }

      dbUser = await prisma.user.create({
        data: { name, email: email!, role: assignedRole, referredBy: validatedRef ?? null },
        include: { artist: true, industryUser: true },
      });

      if (assignedRole === 'artist' || assignedRole === 'producer') {
        let slug = slugify(name);
        let suffix = 0;
        while (await prisma.artist.findUnique({ where: { slug } })) {
          suffix++;
          slug = `${slugify(name)}-${suffix}`;
        }
        await prisma.artist.create({
          data: { userId: dbUser.id, name, slug, country: 'ZA', currency: 'ZAR' },
        });
        sendWelcomeArtist({
          to: email!,
          artistName: name,
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        }).catch(console.error);
      }

      if (assignedRole === 'industry') {
        await prisma.industryUser.create({ data: { userId: dbUser.id, companyName: '' } });
      }
    } else {
      // Existing user — self-heal admin role if ADMIN_EMAIL matches and DB role is wrong
      if (isAdminEmail && !['admin', 'owner', 'super_admin'].includes(dbUser.role)) {
        dbUser = await prisma.user.update({
          where: { email: email! },
          data: { role: 'owner' },
          include: { artist: true, industryUser: true },
        });
        console.log(`[auth/callback] Auto-promoted ${email} to owner (matched ADMIN_EMAIL)`);
      }
    }

    // ALWAYS determine redirect from DB role — never from URL params for existing accounts
    const dbRole = dbUser.role;
    if (dbRole === 'admin' || dbRole === 'owner' || dbRole === 'super_admin') {
      resolvedRedirect = '/admin';
    } else if (dbRole === 'industry') {
      resolvedRedirect = '/industry-dashboard';
    } else if (dbRole === 'artist' || dbRole === 'producer' || dbRole === 'verified_artist' || dbUser.artist) {
      resolvedRedirect = '/dashboard';
    } else {
      resolvedRedirect = '/fan';
    }
  } catch (dbErr) {
    console.error('[auth/callback] DB error:', dbErr);
  }

  // Register device session for this OAuth login (non-blocking — don't fail auth if this errors)
  if (data.user) {
    const userAgent = req.headers.get('user-agent') ?? '';
    const ipAddress = getIpFromHeaders(req.headers);
    const sessionId = `oauth_${Date.now()}_${data.user.id.slice(-8)}`;

    // Look up DB user for their ID
    try {
      const dbUser = await prisma.user.findUnique({
        where: { email: data.user.email! },
        select: { id: true },
      });

      if (dbUser) {
        // Register device in background
        registerDeviceSession({
          userId: dbUser.id,
          sessionId,
          userAgent,
          ipAddress,
          isCurrent: true,
        }).catch(() => { /* non-blocking */ });

        // If 2FA is enabled, intercept and redirect to challenge page
        const has2FA = await user2FAEnabled(dbUser.id).catch(() => false);
        if (has2FA) {
          const mfaUrl = new URL(
            `/auth/2fa?next=${encodeURIComponent(resolvedRedirect)}`,
            req.url
          );
          return NextResponse.redirect(mfaUrl);
        }
      }
    } catch { /* DB lookup failure is non-fatal for OAuth */ }
  }

  return NextResponse.redirect(new URL(resolvedRedirect, req.url));
}
