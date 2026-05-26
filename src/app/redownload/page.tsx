'use client';
import { useState } from 'react';
import { Navbar } from '@/components/Navbar';

export default function RedownloadPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/redownload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSent(true);
      else { const d = await res.json(); setError(d.error || 'Something went wrong'); }
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="w-full max-w-md p-8 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">📬</div>
            <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>Re-download Your Purchases</h1>
            <p style={{ color: 'var(--text-muted)' }}>Enter the email you used to buy and we'll send fresh download links.</p>
          </div>
          {sent ? (
            <div className="text-center p-6 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <p className="text-3xl mb-3">✅</p>
              <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>Sharp! Check your inbox.</p>
              <p style={{ color: 'var(--text-muted)' }}>We've sent fresh download links to <strong style={{ color: 'var(--sky)' }}>{email}</strong></p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email you used to purchase"
                required
                className="w-full px-4 py-3 rounded-xl"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              {error && <p className="text-sm text-red-400">Eish — {error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-60"
                style={{ background: 'var(--red)' }}
              >
                {loading ? 'Just now…' : 'Send My Downloads'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
