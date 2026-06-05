'use client';
// ============================================================
// VUKA — Admin Finance (Phase 5)
// /admin/finance — revenue overview, payout request approval,
// earnings management, financial reports.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, RefreshCw, CheckCircle, XCircle, DollarSign,
  TrendingUp, Download, AlertCircle, Clock, ChevronDown,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

type PayoutTab = 'pending' | 'all' | 'revenue';

export default function AdminFinancePage() {
  const [tab, setTab]           = useState<PayoutTab>('pending');
  const [payouts, setPayouts]   = useState<any[]>([]);
  const [revenue, setRevenue]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [refNum, setRefNum]     = useState('');
  const [failReason, setFailReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`/api/admin/payouts?status=${tab === 'pending' ? 'PENDING' : 'all'}`),
        fetch('/api/admin/finance'),
      ]);
      if (pRes.ok) setPayouts((await pRes.json()).payouts || []);
      if (rRes.ok) {
        const raw = await rRes.json();
        setRevenue({
          totalRevenue: raw.revenue?.lifetime || 0,
          monthRevenue: raw.revenue?.thisMonth || 0,
          pendingPayouts: raw.payouts?.pendingAmount || 0,
          paidOut: raw.payouts?.totalPaid || 0,
        });
      }
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function approveOrReject(payoutId: string, action: 'approve' | 'reject', extra?: Record<string, any>) {
    setActionLoading(payoutId);
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, requestId: payoutId, ...extra }),
      });
      if (res.ok) { await load(); setSelected(null); }
      else { const d = await res.json(); alert(d.error || 'Action failed'); }
    } finally { setActionLoading(null); }
  }

  const STATUS_COLORS: Record<string, string> = {
    PENDING: '#e8c87c', APPROVED: '#38b6e8', PROCESSING: '#38b6e8',
    COMPLETED: '#a0e87c', FAILED: '#ff4d4d', CANCELLED: '#a0a0a0',
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-display">Finance</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Revenue overview & payout management</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Revenue stats */}
      {revenue && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Revenue', value: formatCurrency(revenue.totalRevenue || 0), icon: DollarSign, color: 'var(--green)' },
            { label: 'This Month', value: formatCurrency(revenue.monthRevenue || 0), icon: TrendingUp, color: 'var(--gold)' },
            { label: 'Pending Payouts', value: formatCurrency(revenue.pendingPayouts || 0), icon: Clock, color: '#e8a87c' },
            { label: 'Paid Out Total', value: formatCurrency(revenue.paidOut || 0), icon: CheckCircle, color: '#38b6e8' },
          ].map(s => (
            <div key={s.label} className="p-5 rounded-2xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <s.icon size={18} style={{ color: s.color }} className="mb-2" />
              <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['pending', 'all', 'revenue'] as PayoutTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-medium capitalize"
            style={{
              background: tab === t ? 'rgba(160,232,124,0.12)' : 'var(--surface)',
              color: tab === t ? 'var(--green)' : 'var(--text-muted)',
              border: tab === t ? '1px solid rgba(160,232,124,0.3)' : '1px solid var(--border)',
            }}>
            {t === 'pending' ? 'Pending Payouts' : t === 'all' ? 'All Payouts' : 'Revenue Records'}
          </button>
        ))}
      </div>

      {/* Payouts table */}
      {tab !== 'revenue' && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Artist', 'Amount', 'Method', 'Status', 'Requested', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center">
                    <Loader2 className="animate-spin mx-auto" size={20} style={{ color: 'var(--green)' }} />
                  </td></tr>
                ) : payouts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    No payout requests found
                  </td></tr>
                ) : payouts.map(p => (
                  <tr key={p.id} className="border-t hover:bg-white/[0.02]"
                    style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3 font-medium">{p.artistName || p.artist?.name || '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: 'var(--green)' }}>
                      {formatCurrency(p.amount || 0, p.currency)}
                    </td>
                    <td className="px-4 py-3 capitalize" style={{ color: 'var(--text-muted)' }}>
                      {(p.payoutMethod || 'bank').toLowerCase().replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: `${STATUS_COLORS[p.status] || '#a0a0a0'}22`, color: STATUS_COLORS[p.status] || '#a0a0a0' }}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === 'PENDING' && (
                        <button onClick={() => setSelected(p)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)' }}>
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payout approval modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-2xl p-6 my-4 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-bold text-lg">Review Payout</div>
              <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div className="p-4 rounded-xl space-y-2 text-sm" style={{ background: 'var(--bg)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Artist</span>
                <span className="font-medium">{selected.artistName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Amount</span>
                <span className="font-bold font-mono" style={{ color: 'var(--green)' }}>
                  {formatCurrency(selected.amount || 0, selected.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Method</span>
                <span>{(selected.payoutMethod || '').replace('_', ' ')}</span>
              </div>
            </div>

            <input value={refNum} onChange={e => setRefNum(e.target.value)}
              placeholder="Reference number (for approval)…"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />

            <textarea value={failReason} onChange={e => setFailReason(e.target.value)}
              placeholder="Rejection reason (required for rejection)…"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm resize-none outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => approveOrReject(selected.id, 'approve', { referenceNumber: refNum })}
                disabled={!!actionLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: 'var(--green)', color: '#0a0a0a' }}>
                <CheckCircle size={14} /> Approve
              </button>
              <button onClick={() => approveOrReject(selected.id, 'reject', { reason: failReason })}
                disabled={!!actionLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>
                <XCircle size={14} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
