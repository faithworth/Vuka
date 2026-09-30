// ============================================================
// PATCH 06 — src/app/dashboard/beats/page.tsx
// REPLACE entire file.
// Adds:
//   - Delete beat button (with confirmation dialog)
//   - Guard: cannot delete a beat that was sold exclusively
//   - Shows "Sold — Exclusively Licensed" badge on locked beats
//   - Shows exclusive price column
// ============================================================

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { Trash2, Lock, ExternalLink, AlertTriangle } from 'lucide-react';

export default function DashboardBeatsPage() {
  const [beats, setBeats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/beats')
      .then(r => r.json())
      .then(d => { setBeats(d.beats || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function toggleActive(id: string, current: boolean) {
    await fetch('/api/dashboard/beats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beatId: id, isActive: !current }),
    });
    setBeats(prev => prev.map(b => b.id === id ? { ...b, isActive: !current } : b));
  }

  async function deleteBeat(id: string) {
    setDeleting(id);
    setConfirmId(null);
    const res = await fetch(`/api/dashboard/beats?beatId=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setBeats(prev => prev.filter(b => b.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not delete this beat. Please try again.');
    }
    setDeleting(null);
  }

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Your Beats</h1>
        <Link href="/dashboard/uploads" className="px-4 py-2 rounded-xl font-bold text-white text-sm" style={{ background: 'var(--sky)' }}>
          + Upload Beat
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
        </div>
      ) : beats.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-4xl mb-4">🎵</p>
          <p className="mb-4" style={{ color: 'var(--text-muted)' }}>Nothing here yet, go create</p>
          <Link href="/dashboard/uploads" className="px-6 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--sky)' }}>
            Upload Your First Beat
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Beat', 'Genre', 'BPM', 'Basic', 'Premium', 'Excl', 'Plays', 'Sales', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {beats.map((b: any) => (
                  <tr key={b.id} style={{ opacity: deleting === b.id ? 0.5 : 1 }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {b.artworkUrl
                          ? <img src={b.artworkUrl} className="w-10 h-10 rounded-lg object-cover" alt="" />
                          : <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface2)' }}>🎵</div>
                        }
                        <div>
                          <span className="font-medium" style={{ color: 'var(--text)' }}>{b.title}</span>
                          {b.isExclusive && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Lock size={10} style={{ color: 'var(--gold)' }} />
                              <span className="text-[10px] font-semibold" style={{ color: 'var(--gold)' }}>EXCLUSIVELY SOLD</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{b.genre || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{b.bpm || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--sky)' }}>{formatCurrency(b.basicPrice)}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--sky)' }}>{formatCurrency(b.premiumPrice)}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--gold)' }}>{formatCurrency(b.exclPrice)}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{b.plays}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--green)' }}>{b.sales}</td>
                    <td className="px-4 py-3">
                      {b.isExclusive
                        ? (
                          <span className="text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1"
                            style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--gold)' }}>
                            <Lock size={10} /> Locked
                          </span>
                        ) : (
                          <button onClick={() => toggleActive(b.id, b.isActive)}
                            className="text-xs px-3 py-1 rounded-full font-medium"
                            style={{
                              background: b.isActive ? 'rgba(16,185,129,0.15)' : 'var(--surface2)',
                              color: b.isActive ? 'var(--green)' : 'var(--text-muted)',
                            }}>
                            {b.isActive ? 'Live' : 'Hidden'}
                          </button>
                        )
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/beat/${b.slug}`} target="_blank"
                          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                          style={{ color: 'var(--text-muted)' }}>
                          <ExternalLink size={14} />
                        </Link>
                        {b.isExclusive ? (
                          <span className="p-1.5" title="Cannot delete — sold exclusively">
                            <Lock size={14} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmId(b.id)}
                            disabled={deleting === b.id}
                            className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                            style={{ color: '#ef4444' }}
                            title="Delete beat">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {beats.map((b: any) => (
              <div key={b.id} className="flex items-center gap-3 p-4 rounded-2xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {b.artworkUrl
                  ? <img src={b.artworkUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />
                  : <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl" style={{ background: 'var(--surface2)' }}>🎵</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{b.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {b.genre || 'No genre'} · {b.bpm ? `${b.bpm} BPM` : ''} · {b.plays} plays
                  </p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--sky)' }}>
                    R{b.basicPrice} / R{b.premiumPrice} / R{b.exclPrice}
                  </p>
                  {b.isExclusive && (
                    <div className="flex items-center gap-1 mt-1">
                      <Lock size={9} style={{ color: 'var(--gold)' }} />
                      <span className="text-[9px] font-semibold" style={{ color: 'var(--gold)' }}>EXCLUSIVELY SOLD</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center gap-2">
                  {!b.isExclusive && (
                    <button onClick={() => toggleActive(b.id, b.isActive)}
                      className="text-[10px] px-2 py-1 rounded-full font-medium"
                      style={{
                        background: b.isActive ? 'rgba(16,185,129,0.15)' : 'var(--surface2)',
                        color: b.isActive ? 'var(--green)' : 'var(--text-muted)',
                      }}>
                      {b.isActive ? 'Live' : 'Hidden'}
                    </button>
                  )}
                  {!b.isExclusive && (
                    <button onClick={() => setConfirmId(b.id)}
                      className="p-1.5 rounded-lg" style={{ color: '#ef4444' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmId && (() => {
        const beat = beats.find(b => b.id === confirmId);
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/50">
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: 'var(--text)' }}>Delete "{beat?.title}"?</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                The beat will be removed from the store and all files deleted. Existing buyers keep their licenses and downloads.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmId(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
                  Cancel
                </button>
                <button onClick={() => deleteBeat(confirmId)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: '#ef4444' }}>
                  Delete Beat
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
