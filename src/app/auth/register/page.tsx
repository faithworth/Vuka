'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Music } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { slugify } from '@/lib/utils';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'fan' | 'artist'>('artist');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Eish — enter your name'); return; }
    if (password.length < 8) { setError('Eish — password must be at least 8 characters'); return; }
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role },
        emailRedirectTo: `${window.location.origin}/auth/verify`,
      },
    });

    if (signUpError) {
      setError('Eish — ' + signUpError.message);
      setLoading(false);
      return;
    }

    // Create user + artist record via API
    await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role, slug: slugify(name) }),
    });

    router.push('/auth/verify?email=' + encodeURIComponent(email));
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--purple)] flex items-center justify-center">
              <Music size={20} className="text-white" />
            </div>
            <span className="font-bold text-2xl gradient-text">VUKA</span>
          </Link>
          <h1 className="text-2xl font-bold">Vuka — you&apos;re live. Rise.</h1>
          <p className="text-[var(--text-muted)] mt-1">Create your free account</p>
        </div>

        <div className="card p-8">
          {/* Role select */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {(['artist', 'fan'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`p-4 rounded-xl border text-sm font-medium transition-all ${
                  role === r ? 'border-[var(--purple)] bg-[var(--surface2)] text-[var(--purple-light)]' : 'border-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                {r === 'artist' ? '🎤 Artist / Producer' : '🎧 Fan / Listener'}
              </button>
            ))}
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <input
              type="text"
              className="input"
              placeholder={role === 'artist' ? 'Your artist/producer name' : 'Your name'}
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
            <input
              type="email"
              className="input"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="input"
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />

            {role === 'artist' && (
              <div className="p-3 rounded-xl bg-[var(--surface2)] border border-[var(--border)] text-xs text-[var(--text-muted)]">
                Your store: <span className="text-[var(--purple-light)]">vuka.app/artist/{slugify(name) || 'your-name'}</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-900/20 border border-red-800 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-4">
              {loading ? 'Just now…' : 'Create Account — Rise Up'}
            </button>
          </form>

          <p className="text-center text-sm text-[var(--text-muted)] mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[var(--purple-light)] hover:underline">Log In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
