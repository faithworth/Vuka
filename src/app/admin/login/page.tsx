'use client';
// ============================================================
// VUKA — Admin Login (Phase 2)
// /admin/login — passwordless magic link for SUPERADMIN only.
// Checks device trust first; if trusted, auto-redirects.
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Shield, Mail, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail]       = useState('');
  const [sent, setSent]         = useState(false);
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');

  // If already logged in as admin, redirect immediately
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(me => {
        if (me?.isAdmin) {
          router.replace('/admin');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSending(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Redirect through callback so DB role is resolved before landing on /admin
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (err) { setError(err.message); setSending(false); return; }
    setSent(true);
    setSending(false);
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--green)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-sm"
        style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={14} /> Back to site
      </Link>

      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(160,232,124,0.1)', border: '1px solid rgba(160,232,124,0.3)' }}>
            <Shield size={28} style={{ color: 'var(--green)' }} />
          </div>
        </div>

        <h1 className="text-2xl font-black text-center mb-1 font-display">Admin Access</h1>
        <p className="text-center text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Enter your admin email to receive a magic link.
        </p>

        {sent ? (
          <div className="text-center p-6 rounded-2xl"
            style={{ background: 'rgba(160,232,124,0.08)', border: '1px solid rgba(160,232,124,0.25)' }}>
            <CheckCircle size={40} className="mx-auto mb-3" style={{ color: 'var(--green)' }} />
            <div className="font-bold mb-1">Check your email</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              A magic link has been sent to <strong>{email}</strong>.
              <br />It expires in 10 minutes.
            </div>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Admin Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@vuka.app"
                  required
                  className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.2)' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={sending}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity"
              style={{ background: 'var(--green)', color: '#0a0a0a', opacity: sending ? 0.6 : 1 }}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
              {sending ? 'Sending…' : 'Send Magic Link'}
            </button>
          </form>
        )}

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Only the designated admin account can access this area.
        </p>
      </div>
    </div>
  );
}
