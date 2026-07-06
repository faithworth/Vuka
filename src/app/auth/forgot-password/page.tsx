'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';
import VukaLogo from '@/components/brand/VukaLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data.error ?? 'Too many attempts. Please wait.');
        return;
      }
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-background)' }}>
        <div className="w-full max-w-md text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <VukaLogo size={28} />
          </Link>
          <div className="card p-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(160,232,124,0.12)' }}>
              <CheckCircle2 size={28} style={{ color: 'var(--color-accent-green)' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>Check your email</h1>
            <p className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>We sent a reset link to:</p>
            <p className="font-semibold mb-4" style={{ color: 'var(--color-accent-green)' }}>{email}</p>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              The link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
            <Link href="/auth/login" className="btn btn-secondary w-full gap-2">
              <ArrowLeft size={14} /> Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-background)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <VukaLogo size={28} />
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Forgot password?</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Enter your email and we'll send a reset link</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-text-secondary)' }} />
              <input
                type="email"
                className="input pl-9"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.25)', color: '#f87171' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="btn btn-primary w-full py-3 disabled:opacity-60">
              {loading
                ? <><VukaLoader size={15} /> Sending…</>
                : 'Send Reset Link'}
            </button>
          </form>

          <p className="text-center text-sm mt-5">
            <Link href="/auth/login" className="inline-flex items-center gap-1 hover:underline"
              style={{ color: 'var(--color-text-secondary)' }}>
              <ArrowLeft size={13} /> Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
