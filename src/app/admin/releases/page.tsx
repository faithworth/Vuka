'use client';
// ============================================================
// VUKA — Admin Releases Review (Phase 5)
// /admin/releases — approve/reject/override release status,
// edit metadata, assign ISRC/UPC, trigger distribution.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, RefreshCw, CheckCircle, XCircle, Clock,
  Search, Music, ExternalLink, Zap, Hash, RotateCcw, Flag,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  live: '#a0e87c', approved: '#a0e87c', pending_review: '#e8c87c',
  draft: '#a0a0a0', rejected: '#ff4d4d', distributing: '#38b6e8',
  taken_down: '#ff4d4d', submitted: '#38b6e8',
};

const TAB_FILTERS = ['all', 'pending', 'submitted', 'live', 'rejected', 'draft'] as const;
type TabFilter = typeof TAB_FILTERS[number];

const TAB_LABELS: Record<TabFilter, string> = {
  all: 'All', pending: 'Pending Review', submitted: 'Submitted',
  live: 'Live', rejected: 'Rejected', draft: 'Draft',
};

function Badge({ label, status }: { label: string; status: string }) {
  const color = STATUS_COLORS[status] || '#a0a0a0';
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${color}22`, color }}>
      {label}
    </span>
  );
}

export default function AdminReleasesPage() {
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<TabFilter>('pending');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = tab === 'pending' ? 'metadata_review' : tab;
      const res = await fetch(`/api/admin/releases?status=${statusParam}&search=${encodeURIComponent(search)}`);
      if (res.ok) setReleases((await res.json()).releases || []);
    } finally { setLoading(false); }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, releaseId: string, extra?: Record<string, any>) {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, releaseId, ...extra }),
      });
      if (res.ok) { await load(); setSelected(null); }
      else { const d = await res.json(); alert(d.error || 'Action failed'); }
    } finally { setActionLoading(false); }
  }

  const pending = releases.filter(r =>
    ['pending_review', 'PENDING_REVIEW', 'metadata_review', 'artwork_review'].includes(r.status)
  ).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-display">Releases</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {pending > 0 && <span style={{ color: 'var(--gold)' }}>{pending} pending review · </span>}
            {releases.length} total shown
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
          <button key={t} onClick={() => { setTab(t); }}
            className="px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all"
            style={{
              background: tab === t ? 'rgba(160,232,124,0.12)' : 'var(--surface)',
              color: tab === t ? 'var(--green)' : 'var(--text-muted)',
              border: tab === t ? '1px solid rgba(160,232,124,0.3)' : '1px solid var(--border)',
            }}>
            {TAB_LABELS[t] || t}
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
                {['Release', 'Artist', 'Type', 'Status', 'Tracks', 'Submitted', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center">
                  <Loader2 className="animate-spin mx-auto" size={20} style={{ color: 'var(--green)' }} />
                </td></tr>
              ) : releases.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
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
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{r.artistName || r.artist?.name || '—'}</td>
                  <td className="px-4 py-3 capitalize" style={{ color: 'var(--text-muted)' }}>{r.type?.toLowerCase() || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge label={(r.status || '').replace('_', ' ')} status={(r.status || '').toLowerCase()} />
                  </td>
                  <td className="px-4 py-3">{r._count?.tracks ?? r.tracks?.length ?? 0}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                    {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(r)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)' }}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Release review modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-5"
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
                  {selected.artistName || '—'} · {selected.type} · {selected._count?.tracks || 0} tracks
                </div>
                <div className="mt-1">
                  <Badge label={(selected.status || '').replace('_', ' ')} status={(selected.status || '').toLowerCase()} />
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm p-4 rounded-xl"
              style={{ background: 'var(--bg)' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>UPC</span><br />{selected.upc || 'Auto-assigned on approval'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Genres</span><br />{[selected.primaryGenre, selected.secondaryGenre].filter(Boolean).join(', ') || selected.genres?.join(', ') || '—'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Release Date</span><br />
                {selected.scheduledDate ? new Date(selected.scheduledDate).toLocaleDateString() : selected.releaseDate ? new Date(selected.releaseDate).toLocaleDateString() : '—'}
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>Explicit</span><br />{selected.isExplicit ? 'Yes' : 'No'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Label</span><br />{selected.labelName || 'Self-Released'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Copyright</span><br />{selected.copyrightYear ? `© ${selected.copyrightYear} ${selected.copyrightHolder || ''}` : '—'}</div>
            </div>

            {/* Tracks + ISRC */}
            {selected.tracks?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tracks & ISRCs</div>
                {selected.tracks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text)' }}>{t.trackNumber}. {t.title}</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ background: t.isrc ? 'rgba(160,232,124,0.1)' : 'rgba(160,160,160,0.1)', color: t.isrc ? 'var(--green)' : 'var(--text-muted)' }}>
                      {t.isrc || 'ISRC pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Reject reason */}
            {(selected.status === 'pending' || selected.status === 'metadata_review' || selected.status === 'artwork_review') && (
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Rejection reason (required for rejection)…"
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm resize-none outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            )}

            <div className="grid grid-cols-2 gap-3">
              {(selected.status === 'pending' || selected.status === 'metadata_review' || selected.status === 'artwork_review') && (<>
                <button onClick={() => doAction('approve', selected.id)} disabled={actionLoading}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: 'var(--green)', color: '#0a0a0a' }}>
                  <CheckCircle size={14} /> Approve
                </button>
                <button onClick={() => doAction('reject', selected.id, { reason: rejectReason })} disabled={actionLoading}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                  <XCircle size={14} /> Reject
                </button>
              </>)}
              {(selected.status === 'approved' || selected.status === 'APPROVED') && (
                <button onClick={() => doAction('distribute', selected.id)} disabled={actionLoading}
                  className="col-span-2 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: 'rgba(56,182,232,0.1)', color: '#38b6e8' }}>
                  <Zap size={14} /> Trigger Distribution
                </button>
              )}
              {(selected.status === 'live' || selected.status === 'LIVE') && (
                <button onClick={() => doAction('takedown', selected.id)} disabled={actionLoading}
                  className="col-span-2 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                  <Flag size={14} /> Request Takedown
                </button>
              )}
              <a href={`/releases/${selected.id}`} target="_blank" rel="noopener"
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
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
