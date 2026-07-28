'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Upload, Wand2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export default function AiBundlePage() {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadBundles() {
    fetch('/api/v2/beat-bundle')
      .then(r => r.json())
      .then(d => { setBundles(d.bundles || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadBundles(); }, []);

  async function handleCreate() {
    if (!title.trim() || !file) return;
    setCreating(true);
    setError('');
    try {
      const createRes = await fetch('/api/v2/beat-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || 'Could not create bundle');

      // Upload the source WAV directly to R2 using the presigned URL
      const putRes = await fetch(created.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/wav' },
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload to storage failed');

      // Mark upload complete + attempt to kick off generation
      const patchRes = await fetch(`/api/v2/beat-bundle/${created.bundle.id}`, { method: 'PATCH' });
      const patched = await patchRes.json();
      if (!patchRes.ok) throw new Error(patched.error || 'Could not start generation');

      setTitle('');
      setFile(null);
      loadBundles();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Wand2 size={22} style={{ color: 'var(--sky)' }} />
          AI Beat Bundler
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Upload a source WAV and generate variations. Each finished variation
          lands in Your Beats as a draft — you review, price, and activate the
          ones you want to sell.
        </p>
      </div>

      {/* ── Upload form ── */}
      <div className="rounded-2xl p-6 mb-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Sithi Sessions"
          className="w-full px-4 py-2.5 rounded-xl mb-4 text-sm"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />

        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Source WAV</label>
        <label className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer mb-4"
          style={{ background: 'var(--surface2)', border: '1px dashed var(--border)' }}>
          <Upload size={16} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm truncate" style={{ color: file ? 'var(--text)' : 'var(--text-muted)' }}>
            {file ? file.name : 'Choose a .wav file'}
          </span>
          <input type="file" accept="audio/wav" className="hidden"
            onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm mb-4" style={{ color: '#ef4444' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating || !title.trim() || !file}
          className="px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
          style={{ background: 'var(--sky)' }}>
          {creating ? 'Uploading…' : 'Generate Variations'}
        </button>
      </div>

      {/* ── Bundle list ── */}
      <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
        Your Bundles
      </h2>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
        </div>
      ) : bundles.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No bundles yet.</p>
      ) : (
        <div className="space-y-3">
          {bundles.map(b => (
            <div key={b.id} className="flex items-center justify-between p-4 rounded-2xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{b.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {b.generatedBeatIds?.length || 0} variation{b.generatedBeatIds?.length === 1 ? '' : 's'} generated
                </p>
                {b.status === 'failed' && b.errorMessage && (
                  <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{b.errorMessage}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={b.status} />
                {b.status === 'ready' && (
                  <Link href="/dashboard/beats" className="text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--green)' }}>
                    Review in Your Beats →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    pending:    { icon: Clock,        color: 'var(--text-muted)', bg: 'var(--surface2)',          label: 'Pending' },
    processing: { icon: Clock,        color: 'var(--sky)',        bg: 'rgba(56,189,248,0.12)',     label: 'Generating…' },
    ready:      { icon: CheckCircle2, color: 'var(--green)',      bg: 'rgba(16,185,129,0.15)',     label: 'Ready' },
    failed:     { icon: AlertCircle,  color: '#ef4444',           bg: 'rgba(239,68,68,0.12)',      label: 'Failed' },
  };
  const s = map[status] || map.pending;
  const Icon = s.icon;
  return (
    <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: s.bg, color: s.color }}>
      <Icon size={12} /> {s.label}
    </span>
  );
}
