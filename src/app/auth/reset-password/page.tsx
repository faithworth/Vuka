'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Music, Eye, EyeOff, CheckCircle2, XCircle, Lock } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const colors = ['', '#f87171', '#fbbf24', '#60a5fa', 'var(--color-accent-green)'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all"
            style={{ background: i <= score ? colors[score] : 'var(--color-border-tertiary)' }} />
        ))}
      </div>
      {score > 0 && (
        <p className="text-xs font-medium" style={{ color: colors[score] }}>{labels[score]}</p>
      )}
    </div>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenEmail, setTokenEmail] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError('Missing reset token. Please request a new link.');
      setChecking(false);
      return;
    }
    fetch(`/api/auth/password-reset/confirm?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) { setTokenValid(true); setTokenEmail(d.email ?? ''); }
        else { setTokenError(d.error ?? 'Invalid reset link.'); }
      })
      .catch(() => setTokenError('Could not validate reset link.'))
      .finally(() => setChecking(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to reset password.'); return; }
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 3000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-background)' }}>
      <VukaLoader size={22} />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-background)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-accent-green)' }}>
              <Music size={15} className="text-black" />
            </div>
            <span className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>Vuka Music</span>
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            {done ? 'Password Updated!' : 'Set New Password'}
          </h1>
          {tokenEmail && !done && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>for {tokenEmail}</p>
          )}
        </div>

        <div className="card p-8">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 size={44} className="mx-auto mb-3" style={{ color: 'var(--color-accent-green)' }} />
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                All devices signed out. Redirecting to login…
              </p>
              <Link href="/auth/login" className="btn btn-primary w-full">Sign In</Link>
            </div>
          ) : !tokenValid ? (
            <div className="text-center py-4">
              <XCircle size={44} className="mx-auto mb-3" style={{ color: '#f87171' }} />
              <p className="text-sm mb-4" style={{ color: '#f87171' }}>{tokenError}</p>
              <Link href="/auth/forgot-password" className="btn btn-primary w-full">
                Request New Link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--color-text-secondary)' }} />
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input pl-9 pr-9"
                    placeholder="New password (min. 8 characters)"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <StrengthBar password={password} />
              </div>

              <input
                type="password"
                className="input"
                placeholder="Confirm new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />

              {confirm && password !== confirm && (
                <p className="text-xs" style={{ color: '#f87171' }}>Passwords do not match.</p>
              )}

              {error && (
                <div className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.25)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || password.length < 8 || password !== confirm}
                className="btn btn-primary w-full py-3 disabled:opacity-60">
                {loading
                  ? <><VukaLoader size={15} /> Updating…</>
                  : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-background)' }}>
        <VukaLoader size={22} />
      </div>
    }>
      <ResetForm />
    </Suspense>
  );
}
