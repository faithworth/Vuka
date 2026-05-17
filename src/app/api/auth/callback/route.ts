// src/app/api/auth/callback/route.ts
// Handles Supabase OAuth callback — creates User + Artist DB record if needed.
// Called by Supabase after Google OAuth redirect via NEXT_PUBLIC_SITE_URL/auth/callback
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';
import { sendWelcomeArtist } from '@/lib/emails';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const role = searchParams.get('role') || 'fan'; // passed via OAuth state
  const next = searchParams.get('next') || (role === 'fan' ? '/fan' : '/dashboard');

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', req.url));
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error('[auth/callback] Session exchange failed:', error?.message);
    return NextResponse.redirect(new URL('/auth/login?error=oauth_failed', req.url));
  }

  const { id: supabaseId, email, user_metadata } = data.user;
  const name = user_metadata?.full_name || user_metadata?.name || email?.split('@')[0] || 'User';

  try {
    // Upsert user record — idempotent, safe to call multiple times
    let user = await prisma.user.findUnique({ where: { email: email! } });

    if (!user) {
      user = await prisma.user.create({
        data: { name, email: email!, role },
      });

      // If artist/producer, create Artist profile too
      if (role === 'artist' || role === 'producer') {
        let slug = slugify(name);
        let suffix = 0;
        while (await prisma.artist.findUnique({ where: { slug } })) {
          suffix++;
          slug = `${slugify(name)}-${suffix}`;
        }
        await prisma.artist.create({
          data: {
            userId: user.id,
            name,
            slug,
            country: 'ZA',
            currency: 'ZAR',
          },
        });
        sendWelcomeArtist({ to: email!, name, slug }).catch(console.error);
      }
    }
  } catch (dbErr) {
    console.error('[auth/callback] DB upsert error:', dbErr);
    // Non-fatal — user is authed in Supabase, just redirect
  }

  return NextResponse.redirect(new URL(next, req.url));
}
