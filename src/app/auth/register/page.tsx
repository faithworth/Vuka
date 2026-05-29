'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Music, Eye, EyeOff, Loader2, Briefcase } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { slugify } from '@/lib/utils';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

type Role = 'fan' | 'artist' | 'industry';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRole = searchParams.get('role') || 'artist';
  const validRoles: Role[] = ['fan', 'artist', 'industry'];
  const defaultRole: Role = validRoles.includes(rawRole as Role) ? (rawRole as Role) : 'artist';

  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [company, setCompany]     = useState('');
  const [position, setPosition]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [role, setRole]           = useState<Role>(defaultRole);
  const [loading, setLoading]     = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]         = useState('');

  const isIndustry = role === 'industry';

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    setError('');

    const supabase = createClient();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?role=${role}`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Always write to DB first — role MUST be saved before any redirect
    const dbRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        role,
        slug: slugify(name),
        ...(isIndustry && { company, position }),
      }),
    });

    if (!dbRes.ok) {
      setError('Account created but profile setup failed. Please contact support.');
      setLoading(false);
      return;
    }

    // DB is written — now safe to redirect
    // If session exists (email confirmation disabled), use /api/auth/me to get healed role
    if (signUpData?.session) {
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          if (['admin','owner','super_admin'].includes(me.role)) { router.push('/admin'); return; }
          if (me.role === 'industry' || me.isIndustry) { router.push('/industry-dashboard'); return; }
          if (me.role === 'artist' || me.role === 'producer' || me.isArtist) { router.push('/dashboard'); return; }
        }
      } catch {}
      // Fallback using chosen role
      if (role === 'artist') { router.push('/dashboard'); return; }
      if (role === 'industry') { router.push('/industry-dashboard'); return; }
      router.push('/fan');
      return;
    }

    // Email confirmation required
    const params = new URLSearchParams({ email, role });
    router.push(`/auth/verify?${params.toString()}`);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?role=${role}`,
      },
    });
  };

  const roleOptions: { value: Role; label: string; description: string; icon: React.ReactNode }[] = [
    { value: 'artist',   label: 'Artist / Producer', description: 'Sell beats, releases, videos & more', icon: <Music size={16} /> },
    { value: 'fan',      label: 'Fan / Listener',     description: 'Discover & support African artists',  icon: '🎧' },
    { value: 'industry', label: 'Industry',            description: 'Labels, managers & A&R professionals', icon: <Briefcase size={16} /> },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--sky)' }}>
              <Music size={16} className="text-white" />
            </div>
            <span className="font-black text-xl" style={{ color: 'var(--text)' }}>Vuka</span>
          </Link>
          <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text)' }}>Create your account</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Africa's music marketplace</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">

          <div className="grid grid-cols-3 gap-2">
            {roleOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className="p-3 rounded-xl text-left transition-all"
                style={{
                  background: role === opt.value ? 'var(--sky)' : 'var(--surface)',
                  border: `1px solid ${role === opt.value ? 'var(--sky)' : 'var(--border)'}`,
                  color: role === opt.value ? 'white' : 'var(--text)',
                }}>
                <div className="text-lg mb-1">{opt.icon}</div>
                <p className="text-xs font-bold leading-tight">{opt.label}</p>
              </button>
            ))}
          </div>

          {isIndustry && (
            <div className="p-3 rounded-xl text-sm"
              style={{ background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.3)', color: 'var(--gold)' }}>
              <p className="font-semibold mb-0.5">Industry Portal</p>
              <p className="text-xs opacity-80">
                Discover artists, send deal proposals, and track referral earnings.
              </p>
            </div>
          )}

          <input className="input" type="text"
            placeholder={isIndustry ? 'Your full name' : 'Your name'}
            value={name} onChange={e => setName(e.target.value)} required />

          {isIndustry && (
            <div className="grid grid-cols-2 gap-3">
              <input className="input" type="text" placeholder="Company / Label" value={company} onChange={e => setCompany(e.target.value)} />
              <input className="input" type="text" placeholder="Role / Position" value={position} onChange={e => setPosition(e.target.value)} />
            </div>
          )}

          <input className="input" type="email" placeholder="Email address"
            value={email} onChange={e => setEmail(e.target.value)} required />

          <div className="relative">
            <input className="input pr-12"
              type={showPw ? 'text' : 'password'}
              placeholder="Password (min 8 characters)"
              value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg"
              style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="btn btn-primary w-full disabled:opacity-60">
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          <button type="button" onClick={handleGoogle} disabled={googleLoading}
            className="btn btn-secondary w-full disabled:opacity-60">
            {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link href="/auth/login" className="font-semibold" style={{ color: 'var(--sky)' }}>Sign in</Link>
          </p>

          <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            By signing up you agree to our{' '}
            <Link href="/legal/terms" className="underline">Terms</Link> and{' '}
            <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
