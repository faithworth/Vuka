import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';
import { sendWelcomeArtist } from '@/lib/emails';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  // roleParam is ONLY used for brand-new users who just registered
  const roleParam = searchParams.get('role') || 'fan';

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
      const assignedRole = isAdminEmail ? 'admin' : roleParam;
      dbUser = await prisma.user.create({
        data: { name, email: email!, role: assignedRole },
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
      if (isAdminEmail && dbUser.role !== 'admin' && dbUser.role !== 'owner' && dbUser.role !== 'super_admin') {
        dbUser = await prisma.user.update({
          where: { email: email! },
          data: { role: 'admin' },
          include: { artist: true, industryUser: true },
        });
        console.log(`[auth/callback] Auto-promoted ${email} to admin (matched ADMIN_EMAIL)`);
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

  return NextResponse.redirect(new URL(resolvedRedirect, req.url));
}
