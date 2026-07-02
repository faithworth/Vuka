'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Music, ShieldCheck, KeyRound } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

function TwoFAForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get('next') ?? '/fan';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [useBackup]);

  function handleCodeChange(val: string) {
    if (useBackup) {
      setCode(val.toUpperCase().slice(0, 17));
    } else {
      setCode(val.replace(/\D/g, '').slice(0, 6));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/2fa?action=verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Invalid code. Please try again.');
        setCode('');
        inputRef.current?.focus();
        return;
      }

      // Store challenge token
      if (data.challengeToken) {
        sessionStorage.setItem('vuka_2fa_ok', data.challengeToken);
      }

      // Register device session after successful 2FA
      try {
        const dr = await fetch('/api/auth/devices?action=register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (dr.ok) {
          const { sessionId } = await dr.json();
          sessionStorage.setItem('vuka_session_id', sessionId);
        }
      } catch { /* non-blocking */ }

      router.push(nextUrl);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = loading || (useBackup ? code.length < 9 : code.length !== 6);

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-accent-green)' }}>
              <Music size={15} className="text-black" />
            </div>
            <span className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>Vuka Music</span>
          </Link>

          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(160,232,124,0.12)' }}>
            {useBackup
              ? <KeyRound size={24} style={{ color: 'var(--color-accent-green)' }} />
              : <ShieldCheck size={24} style={{ color: 'var(--color-accent-green)' }} />}
          </div>

          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            {useBackup ? 'Enter Backup Code' : 'Two-Factor Verification'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {useBackup
              ? 'Enter one of your 10-character backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {useBackup ? (
              <input
                ref={inputRef}
                type="text"
                className="input text-center font-mono tracking-widest text-lg py-4"
                placeholder="XXXXXXXX-XXXXXXXX"
                value={code}
                onChange={e => handleCodeChange(e.target.value)}
                maxLength={17}
                required
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="input text-center text-3xl font-mono tracking-[0.5em] py-5"
                placeholder="000000"
                value={code}
                onChange={e => handleCodeChange(e.target.value)}
                maxLength={6}
                required
              />
            )}

            {error && (
              <div className="px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'rgba(255,77,77,0.1)',
                  border: '1px solid rgba(255,77,77,0.25)',
                  color: '#f87171',
                }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isDisabled}
              className="btn btn-primary w-full py-3 disabled:opacity-60">
              {loading
                ? <><VukaLoader size={15} /> Verifying…</>
                : 'Verify'}
            </button>
          </form>

          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border-tertiary)' }}>
            <button
              type="button"
              onClick={() => { setUseBackup(v => !v); setCode(''); setError(''); }}
              className="w-full text-sm text-center hover:underline"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-accent-green)',
              }}>
              {useBackup ? '← Use authenticator app' : "Can't access your app? Use a backup code"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm mt-4">
          <Link href="/auth/login" className="hover:underline"
            style={{ color: 'var(--color-text-secondary)' }}>
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function TwoFAPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-background)' }}>
        <VukaLoader size={22} />
      </div>
    }>
      <TwoFAForm />
    </Suspense>
  );
}
