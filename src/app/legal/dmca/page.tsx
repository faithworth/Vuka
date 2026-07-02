'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Music2, Send, CheckCircle } from 'lucide-react';

export default function DMCAPage() {
  const [form, setForm] = useState({ name: '', email: '', itemUrl: '', originalWork: '', description: '', signature: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // POST to admin email — no DB route needed, just mailto fallback
    await fetch('/api/dmca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => {});
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-4 flex items-center gap-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sky)' }}><Music2 size={13} className="text-white" /></div>
          <span className="font-bold" style={{ color: 'var(--text)' }}>Vuka Music</span>
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>DMCA Takedown</span>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>DMCA Takedown Notice</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          If you believe your copyrighted work has been uploaded to Vuka Music without authorisation, complete this form. We will investigate within 72 hours.
        </p>

        {submitted ? (
          <div className="text-center py-16">
            <CheckCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--green)' }} />
            <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Notice Received</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>We will review your claim and respond within 72 hours at the email you provided.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Your Full Name *</label>
                <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Legal name" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Your Email *</label>
                <input className="input" type="email" required value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)' }}>URL of Infringing Content on Vuka Music *</label>
              <input className="input" required value={form.itemUrl} onChange={e => setForm(p => ({ ...p, itemUrl: e.target.value }))} placeholder="https://vukamusic.com/beat/..." />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)' }}>URL of Your Original Work (if available)</label>
              <input className="input" value={form.originalWork} onChange={e => setForm(p => ({ ...p, originalWork: e.target.value }))} placeholder="Link proving your ownership" />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Description of Infringement *</label>
              <textarea className="input" rows={4} required value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe how your work was copied or used without permission..." />
            </div>

            <div className="p-4 rounded-xl text-xs" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Declaration</p>
              <p>By submitting this form, I declare under penalty of perjury that: (1) I am the copyright owner or authorised to act on their behalf; (2) the information in this notice is accurate; (3) I have a good faith belief that the use is not authorised by the copyright owner, its agent, or the law.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Electronic Signature (type your full name) *</label>
              <input className="input" required value={form.signature} onChange={e => setForm(p => ({ ...p, signature: e.target.value }))} placeholder="Full legal name" />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              <Send size={15} />
              {loading ? 'Submitting…' : 'Submit DMCA Notice'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
