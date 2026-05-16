'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Music, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Suspense } from 'react';

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email');

  useEffect(() => {
    // Check if already verified (OAuth redirect)
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/dashboard');
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--purple)]/20 flex items-center justify-center mx-auto mb-6">
          <Mail size={32} className="text-[var(--purple-light)]" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Check your email</h1>
        <p className="text-[var(--text-muted)] mb-2">
          We sent a verification link to:
        </p>
        {email && <p className="font-semibold text-[var(--purple-light)] mb-6">{email}</p>}
        <p className="text-[var(--text-muted)] text-sm mb-8">
          Click the link in the email to verify your account and activate your store.
        </p>
        <Link href="/auth/login" className="btn btn-secondary">
          Back to Login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-[var(--text-muted)]">Just now…</div></div>}>
      <VerifyContent />
    </Suspense>
  );
}
