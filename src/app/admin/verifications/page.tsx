'use client';
// ============================================================
// VUKA — Admin: Artist Verification Review
// /admin/verifications
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, ExternalLink, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

const TABS = ['pending', 'approved', 'rejected'] as const;

export default function AdminVerificationsPage() {
  const [tab, setTab]         = useState<typeof TABS[number]>('pending');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/moderation/verify?status=${tab}`);
      const data = await res.json();
      if (res.ok) setRequests(data.requests || []);
      else setError(data.error || `HTTP ${res.status}`);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function decide(requestId: string, decision: 'approved' | 'rejected') {
    setActioning(requestId);
    try {
      const res = await fetch('/api/moderation/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, decision, adminNotes: notesDraft[requestId] || '' }),
      });
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to submit decision');
      }
    } finally {
      setActioning(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={22} style={{ color: 'var(--green)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Artist Verification</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Review legal name + ID document submissions. Documents are private — viewing generates a 5-minute link, never a stored one.</p>

      <div className="flex items-center gap-2 mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize"
            style={{
              background: tab === t ? 'rgba(160,232,124,0.15)' : 'var(--surface2)',
              color: tab === t ? 'var(--green)' : 'var(--text-muted)',
            }}>
            {t}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="text-sm mb-4" style={{ color: '#ff4d4d' }}>{error}</p>}

      {loading ? (
        <div className="py-16 flex justify-center"><VukaLoader size={24} /></div>
      ) : requests.length === 0 ? (
        <p className="text-sm py-10 text-center" style={{ color: 'var(--text-muted)' }}>No {tab} requests.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r: any) => (
            <div key={r.id} className="p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold" style={{ color: 'var(--text)' }}>{r.legalName}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Artist: {r.artist?.name} ({r.artist?.slug}) · {r.artist?.user?.email}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Submitted {new Date(r.createdAt).toLocaleDateString()}</p>
                  {r.socialProofUrl && (
                    <a href={r.socialProofUrl} target="_blank" rel="noreferrer"
                      className="text-xs mt-1 inline-flex items-center gap-1 underline" style={{ color: 'var(--sky)' }}>
                      Social proof <ExternalLink size={10} />
                    </a>
                  )}
                  {r.additionalInfo && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>"{r.additionalInfo}"</p>}
                </div>
                <a href={`/api/admin/verification/${r.id}/document`} target="_blank" rel="noreferrer"
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
                  View ID <ExternalLink size={12} />
                </a>
              </div>

              {tab === 'pending' && (
                <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <input placeholder="Notes (optional, sent to artist if rejected)"
                    value={notesDraft[r.id] || ''}
                    onChange={e => setNotesDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <button onClick={() => decide(r.id, 'approved')} disabled={actioning === r.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                    style={{ background: 'rgba(160,232,124,0.15)', color: 'var(--green)' }}>
                    <CheckCircle size={12} /> Approve
                  </button>
                  <button onClick={() => decide(r.id, 'rejected')} disabled={actioning === r.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                    style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                    <XCircle size={12} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
