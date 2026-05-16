'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export default function DashboardBeatsPage() {
  const [beats, setBeats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/beats').then(r => r.json()).then(d => { setBeats(d.beats || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function toggleActive(id: string, current: boolean) {
    await fetch('/api/dashboard/beats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beatId: id, isActive: !current }) });
    setBeats(prev => prev.map(b => b.id === id ? { ...b, isActive: !current } : b));
  }

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Your Beats</h1>
        <Link href="/dashboard/uploads" className="px-4 py-2 rounded-xl font-bold text-white text-sm" style={{ background: 'var(--purple)' }}>
          + Upload Beat
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />)}</div>
      ) : beats.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-4xl mb-4">🎵</p>
          <p className="mb-4" style={{ color: 'var(--text-muted)' }}>Nothing here yet, go create</p>
          <Link href="/dashboard/uploads" className="px-6 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>Upload Your First Beat</Link>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Beat', 'Genre', 'BPM', 'Basic', 'Premium', 'Plays', 'Sales', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {beats.map((b: any) => (
                <tr key={b.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {b.artworkUrl ? <img src={b.artworkUrl} className="w-10 h-10 rounded-lg object-cover" alt="" /> : <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface2)' }}>🎵</div>}
                      <span className="font-medium" style={{ color: 'var(--text)' }}>{b.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{b.genre || '—'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{b.bpm || '—'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--purple-light)' }}>{formatCurrency(b.basicPrice)}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--purple-light)' }}>{formatCurrency(b.premiumPrice)}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{b.plays}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--green)' }}>{b.sales}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(b.id, b.isActive)}
                      className="text-xs px-3 py-1 rounded-full font-medium"
                      style={{ background: b.isActive ? 'rgba(16,185,129,0.15)' : 'var(--surface2)', color: b.isActive ? 'var(--green)' : 'var(--text-muted)' }}>
                      {b.isActive ? 'Live' : 'Hidden'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
