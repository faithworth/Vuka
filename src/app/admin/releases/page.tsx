'use client';
// ============================================================
// VUKA — Admin Releases
// /admin/releases — post-publish moderation for the direct-sales
// catalog. Vuka has no DSP distribution and no pre-publish review
// queue: releases go live the moment the artist publishes them.
// This page lets admins unpublish, republish, or delete a release.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, RefreshCw, Eye, EyeOff, Trash2,
  Search, Music, ExternalLink,
} from 'lucide-react';

const TAB_FILTERS = ['all', 'active', 'inactive'] as const;
type TabFilter = typeof TAB_FILTERS[number];

const TAB_LABELS: Record<TabFilter, string> = {
  all: 'All', active: 'Live', inactive: 'Unpublished',
};

function Badge({ isActive }: { isActive: boolean }) {
  const color = isActive ? '#a0e87c' : '#ff4d4d';
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${color}22`, color }}>
      {isActive ? 'Live' : 'Unpublished'}
    </span>
  );
}

export default function AdminReleasesPage() {
  const [releases, setReleases] = useState<any[]>([]);
  const [counts, setCounts]     = useState<{ all: number; active: number; inactive: number }>({ all: 0, active: 0, inactive: 0 });
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<TabFilter>('active');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [reason, setReason]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/releases?status=${tab}&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases || []);
        setCounts(data.counts || { all: 0, active: 0, inactive: 0 });
      }
    } finally { setLoading(false); }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: 'activate' | 'deactivate' | 'delete', releaseId: string, extra?: Record<string, any>) {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch('/api/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, releaseId, ...extra }),
      });
      if (res.ok) { await load(); setSelected(null); setReason(''); }
      else { const d = await res.json(); setActionError(d.error || 'Action failed'); }
    } finally { setActionLoading(false); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-display">Releases</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--green)' }}>{counts.active} live</span>
            {counts.inactive > 0 && <> · <span style={{ color: '#ff4d4d' }}>{counts.inactive} unpublished</span></>}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 flex-wrap mb-4">
        {TAB_FILTERS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: tab === t ? 'rgba(160,232,124,0.12)' : 'var(--surface)',
              color: tab === t ? 'var(--green)' : 'var(--text-muted)',
              border: tab === t ? '1px solid rgba(160,232,124,0.3)' : '1px solid var(--border)',
            }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by title or artist…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Release', 'Artist', 'Type', 'Status', 'Tracks', 'Sales', 'Created', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center">
                  <Loader2 className="animate-spin mx-auto" size={20} style={{ color: 'var(--green)' }} />
                </td></tr>
              ) : releases.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  No releases in this category
                </td></tr>
              ) : releases.map(r => (
                <tr key={r.id} className="border-t hover:bg-white/[0.02]"
                  style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.artworkUrl
                        ? <img src={r.artworkUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        : <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'var(--bg)' }}>
                            <Music size={14} style={{ color: 'var(--text-muted)' }} />
                          </div>
                      }
                      <span className="font-medium max-w-[160px] truncate">{r.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{r.artist?.name || '—'}</td>
                  <td className="px-4 py-3 capitalize" style={{ color: 'var(--text-muted)' }}>{r.releaseType || '—'}</td>
                  <td className="px-4 py-3"><Badge isActive={r.isActive} /></td>
                  <td className="px-4 py-3">{r._count?.tracks ?? r.tracks?.length ?? 0}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{r.sales ?? 0}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setSelected(r); setReason(''); setActionError(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)' }}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Release manage modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-5 my-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              {selected.artworkUrl
                ? <img src={selected.artworkUrl} alt="" className="w-20 h-20 rounded-xl object-cover" />
                : <div className="w-20 h-20 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--bg)' }}>
                    <Music size={24} style={{ color: 'var(--text-muted)' }} />
                  </div>
              }
              <div className="flex-1">
                <div className="font-bold text-lg">{selected.title}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {selected.artist?.name || '—'} · {selected.releaseType} · {selected._count?.tracks || 0} tracks
                </div>
                <div className="mt-1"><Badge isActive={selected.isActive} /></div>
              </div>
              <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm p-4 rounded-xl" style={{ background: 'var(--bg)' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Price</span><br />
                {selected.payWhatWant ? `Pay What You Want (min R${selected.minPrice || 0})` : `R${selected.price ?? 0}`}
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>Sales</span><br />{selected.sales ?? 0}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Release Date</span><br />
                {selected.releaseDate ? new Date(selected.releaseDate).toLocaleDateString() : '—'}
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>Created</span><br />
                {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}
              </div>
            </div>

            {selected.credits && (
              <div className="text-xs p-3 rounded-xl whitespace-pre-wrap" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                {selected.credits}
              </div>
            )}

            {/* Tracks */}
            {selected.tracks?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tracks</div>
                {selected.tracks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text)' }}>{t.trackNumber}. {t.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Unpublish reason — required */}
            {selected.isActive && (
              <textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Reason for unpublishing (required, sent to the artist)…"
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm resize-none outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            )}

            {actionError && (
              <p className="text-xs" style={{ color: '#ff4d4d' }}>{actionError}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              {selected.isActive ? (
                <button onClick={() => doAction('deactivate', selected.id, { notes: reason })}
                  disabled={actionLoading || !reason.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                  <EyeOff size={14} /> Unpublish
                </button>
              ) : (
                <button onClick={() => doAction('activate', selected.id)} disabled={actionLoading}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'var(--green)', color: '#0a0a0a' }}>
                  <Eye size={14} /> Republish
                </button>
              )}
              {!selected.isActive && (selected.sales ?? 0) === 0 && (
                <button onClick={() => { if (confirm('Permanently delete this release?')) doAction('delete', selected.id); }}
                  disabled={actionLoading}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <a href={`/releases/${selected.id}`} target="_blank" rel="noopener"
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 col-span-2"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <ExternalLink size={14} /> Public Page
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
