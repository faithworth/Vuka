// ============================================================
// PATCH 09 — src/app/dashboard/releases/page.tsx
// REPLACE entire file.
// Adds delete button with confirmation modal + guard messaging.
// ============================================================

'use client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { Plus, ExternalLink, Music, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';

export default function DashboardReleasesPage() {
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/releases')
      .then(r => r.json())
      .then(d => setReleases(Array.isArray(d.releases) ? d.releases : []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  async function toggleActive(id: string, current: boolean) {
    await fetch('/api/dashboard/releases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ releaseId: id, isActive: !current }),
    });
    setReleases(prev => prev.map(r => r.id === id ? { ...r, isActive: !current } : r));
  }

  async function deleteRelease(id: string) {
    setDeleting(id);
    setConfirmId(null);
    const res = await fetch(`/api/dashboard/releases?releaseId=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setReleases(prev => prev.filter(r => r.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not delete this release.');
    }
    setDeleting(null);
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>My Releases</h1>
        <Link href="/dashboard/uploads"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: 'var(--sky)' }}>
          <Plus className="w-4 h-4" /> Upload Release
        </Link>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && releases.length === 0 && (
        <div className="text-center py-20 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Music className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--sky)' }} />
          <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>Nothing here yet</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Upload your first EP, album or single.</p>
          <Link href="/dashboard/uploads" className="px-4 py-2 rounded-lg font-bold text-white inline-block"
            style={{ background: 'var(--sky)' }}>Upload Now</Link>
        </div>
      )}

      <div className="space-y-3">
        {releases.map((release: any) => (
          <div key={release.id}
            className="flex items-center gap-4 p-4 rounded-xl border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', opacity: deleting === release.id ? 0.5 : 1 }}>
            <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl"
              style={{ background: 'var(--surface2)' }}>
              {release.artworkUrl
                ? <img src={release.artworkUrl} className="w-full h-full object-cover" alt={release.title} />
                : '🎵'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{release.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--sky)' }}>
                  {release.releaseType}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full`}
                  style={{
                    background: release.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                    color: release.isActive ? 'var(--green)' : '#ef4444',
                  }}>
                  {release.isActive ? 'Active' : 'Hidden'}
                </span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {release.tracks?.length || 0} tracks · {release.plays} plays · {release.sales} sales · {formatCurrency(release.price)}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => toggleActive(release.id, release.isActive)}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                title={release.isActive ? 'Hide release' : 'Make live'}
                style={{ color: 'var(--text-muted)' }}>
                {release.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <Link href={`/release/${release.slug}`} target="_blank"
                className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                style={{ color: 'var(--sky)' }}>
                <ExternalLink className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setConfirmId(release.id)}
                disabled={deleting === release.id}
                className="p-2 rounded-lg transition-colors hover:bg-red-50"
                title="Delete release"
                style={{ color: '#ef4444' }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {confirmId && (() => {
        const release = releases.find(r => r.id === confirmId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: 'var(--text)' }}>Delete "{release?.title}"?</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                All tracks will be permanently removed. This will fail if buyers have confirmed purchases — hide it instead.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmId(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
                  Cancel
                </button>
                <button onClick={() => deleteRelease(confirmId)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: '#ef4444' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
