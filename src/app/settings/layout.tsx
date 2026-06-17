'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Shield, Loader2, ArrowLeft } from 'lucide-react';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/auth/login?next=/settings/security');
        return;
      }
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-background)' }}>
        <Loader2 size={22} className="animate-spin"
          style={{ color: 'var(--color-accent-green)' }} />
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <header
        className="sticky top-0 z-40 h-14 flex items-center px-4"
        style={{
          background: 'var(--color-background-secondary)',
          borderBottom: '1px solid var(--color-border-tertiary)',
        }}>
        <div className="max-w-2xl mx-auto w-full flex items-center gap-3">
          <Link href="/" className="font-bold text-lg" style={{ color: 'var(--color-accent-green)' }}>
            Vuka
          </Link>
          <div className="w-px h-4" style={{ background: 'var(--color-border-tertiary)' }} />
          <div className="flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--color-text-secondary)' }}>
            <Shield size={14} />
            Security
          </div>
          <div className="flex-1" />
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm hover:underline"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}>
            <ArrowLeft size={13} />
            Back
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
