import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';
import { sendWelcomeArtist } from '@/lib/emails';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const role = searchParams.get('role') || 'fan';

  const redirectMap: Record<string, string> = {
    artist: '/dashboard',
    industry: '/industry-dashboard',
    fan: '/fan',
  };
  const next = searchParams.get('next') || redirectMap[role] || '/fan';

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
        setAll(cookiesToSet) {
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

  try {
    let user = await prisma.user.findUnique({ where: { email: email! } });

    if (!user) {
      user = await prisma.user.create({ data: { name, email: email!, role } });

      if (role === 'artist' || role === 'producer') {
        let slug = slugify(name);
        let suffix = 0;
        while (await prisma.artist.findUnique({ where: { slug } })) {
          suffix++;
          slug = `${slugify(name)}-${suffix}`;
        }
        await prisma.artist.create({
          data: { userId: user.id, name, slug, country: 'ZA', currency: 'ZAR' },
        });
        sendWelcomeArtist({ to: email!, name, slug }).catch(console.error);
      }

      if (role === 'industry') {
        await prisma.industryUser.create({
          data: { userId: user.id },
        });
      }
    }
  } catch (dbErr) {
    console.error('[auth/callback] DB error:', dbErr);
  }

  return NextResponse.redirect(new URL(next, req.url));
}
