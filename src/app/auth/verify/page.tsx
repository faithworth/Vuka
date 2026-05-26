'use client';
// src/app/auth/verify/page.tsx
// Shows email verification pending screen.
// For Google OAuth users, Supabase redirects to /api/auth/callback, not here.
// This page handles the email-link flow: user lands here after register, awaits email click.
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email');
  const role = params.get('role') || 'fan';

  useEffect(() => {
    // Poll — if the user clicks the email link in another tab and comes back verified, redirect.
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        // Ensure DB record exists (covers edge case where email-link verify happens)
        try {
          await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              email: session.user.email,
              role,
            }),
          });
        } catch (_) {}
        router.replace(role === 'fan' ? '/fan' : '/dashboard');
      }
    });
    return () => subscription.unsubscribe();
  }, [router, role]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'color-mix(in srgb, var(--sky) 15%, transparent)' }}>
          <Mail size={32} style={{ color: 'var(--sky)' }} />
        </div>
        <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text)' }}>Check your email</h1>
        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
          We sent a verification link to:
        </p>
        {email && (
          <p className="font-semibold mb-6" style={{ color: 'var(--sky)' }}>{email}</p>
        )}
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Click the link in your email to activate your account. This page will automatically redirect once verified.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/auth/login"
            className="w-full py-3 rounded-xl font-semibold text-sm text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
