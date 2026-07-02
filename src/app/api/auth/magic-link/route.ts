// ============================================================
// VUKA — Magic Link Auth (Phase 9)
// POST /api/auth/magic-link
// Sends a Supabase OTP / magic link email + Phase 9 branded email.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase_server';
import { sendMagicLink } from '@/lib/emails';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email: string = (body.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminRequest = email === adminEmail?.toLowerCase() && body.admin === true;

    const redirectTo = isAdminRequest
      ? `${appUrl}/api/auth/callback?next=/admin`
      : `${appUrl}/api/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: !isAdminRequest,
      },
    });

    if (error) {
      if (error.message.includes('rate limit') || error.status === 429) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a minute and try again.' },
          { status: 429 }
        );
      }
      console.error('[magic-link] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 });
    }

    // Phase 9: Also send branded magic link email via Resend
    // (Supabase sends its own OTP — this is supplemental branding)
    // Only send our branded email for admin flow where Supabase default template is less polished
    if (isAdminRequest) {
      sendMagicLink({
        to: email,
        displayName: 'Admin',
        magicUrl: redirectTo,
        isAdmin: true,
      }).catch(e => console.error('[magic-link] Phase9 email failed:', e));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[magic-link] Unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
