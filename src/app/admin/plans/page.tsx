'use client';
// src/app/admin/plans/page.tsx
// Admin: View all artist plan subscriptions, override plans, cancel, extend.

import { useEffect, useState, useCallback } from 'react';
import {
  Crown, Zap, Star, Search, RefreshCw, CheckCircle, XCircle, Clock, ChevronDown,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

const PLAN_DEFS: Record<string, { color: string; label: string }> = {
  free:  { color: '#6b7280', label: 'Free'  },
  pro:   { color: '#38bdf8', label: 'Pro'   },
  label: { color: '#f59e0b', label: 'Label' },
};

function PlanBadge({ slug }: { slug: string }) {
  const def = PLAN_DEFS[slug] || PLAN_DEFS.free;
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${def.color}22`, color: def.color }}>
      {def.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    active:    { color: '#22c55e', label: 'Active'    },
    cancelled: { color: '#f59e0b', label: 'Cancelled' },
    expired:   { color: '#6b7280', label: 'Expired'   },
    failed:    { color: '#ef4444', label: 'Failed'    },
  };
  const s = map[status] || map.expired;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${s.color}22`, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function AdminPlansPage() {
  const [artists, setArtists] = useState<any[]>([]);
  const [planCounts, setPlanCounts] = useState<any>({});
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Override modal state
  const [modal, setModal] = useState<any | null>(null);
  const [overridePlan, setOverridePlan] = useState('pro');
  const [overrideMonths, setOverrideMonths] = useState('1');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ plan: planFilter, q: search, page: String(page) });
      const res = await fetch(`/api/admin/plans?${params}`);
      if (res.ok) {
        const d = await res.json();
        setArtists(d.artists || []);
        setPlanCounts(d.planCounts || {});
        setTotalPages(d.pages || 1);
        setTotal(d.total || 0);
        setIncompleteCount(d.incompleteArtistCount || 0);
      }
    } finally { setLoading(false); }
  }, [planFilter, search, page]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, artistId: string) {
    setActionLoading(true);
    setActionMsg('');
    try {
      const body: any = { artistId, action };
      if (action === 'set_plan') { body.planSlug = overridePlan; body.months = parseInt(overrideMonths); }
      if (action === 'extend_plan') body.months = parseInt(overrideMonths);

      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.ok) {
        setActionMsg('Done!');
        await load();
        setTimeout(() => { setModal(null); setActionMsg(''); }, 800);
      } else {
        setActionMsg(d.error || 'Action failed');
      }
    } catch {
      setActionMsg('Network error');
    }
    setActionLoading(false);
  }

  const summary = [
    { label: 'Free', count: planCounts.free || 0, color: '#6b7280' },
    { label: 'Pro',  count: planCounts.pro  || 0, color: '#38bdf8' },
    { label: 'Label',count: planCounts.label || 0, color: '#f59e0b' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-display">Plan Management</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {total} artists total
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {loading ? <VukaLoader size={14} /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {summary.map(s => (
          <div key={s.label} className="p-4 rounded-2xl"
            style={{ background: 'var(--surface)', border: `1px solid ${s.color}33` }}>
            <div className="text-2xl font-black mb-1" style={{ color: s.color }}>{s.count}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.label} plan</div>
          </div>
        ))}
      </div>

      {/* Incomplete artist profiles notice */}
      {incompleteCount > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(232,168,124,0.08)', border: '1px solid rgba(232,168,124,0.25)', color: '#e8a87c' }}>
          ⚠ {incompleteCount} user{incompleteCount !== 1 ? 's' : ''} registered with role=artist but never completed artist profile setup — they won&apos;t appear in this table. You can manage them from the{' '}
          <a href="/admin/users" style={{ textDecoration: 'underline' }}>Users page</a>.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search artist name or email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
        <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <option value="all">All Plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="label">Label</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <VukaLoader size={24} />
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Artist', 'Email', 'Plan', 'Expires', 'Sub Status', 'Sub History', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artists.map(a => {
                const latestSub = a.planSubscriptions?.[0];
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--surface2)] transition-colors">
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{a.name}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{a.user?.email}</td>
                    <td className="px-4 py-3"><PlanBadge slug={a.planSlug} /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {a.planSlug === 'free' ? '—' : a.planExpiresAt
                        ? new Date(a.planExpiresAt).toLocaleDateString('en-ZA')
                        : 'No expiry set'}
                    </td>
                    <td className="px-4 py-3">
                      {latestSub ? <StatusBadge status={latestSub.status} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {a.planSubscriptions?.length || 0} payment{a.planSubscriptions?.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setModal(a); setOverridePlan(a.planSlug === 'free' ? 'pro' : a.planSlug); setOverrideMonths('1'); setActionMsg(''); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--surface)]"
                        style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
              {artists.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    No artists found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            Previous
          </button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            Next
          </button>
        </div>
      )}

      {/* Manage Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>{modal.name}</h3>
              <button onClick={() => setModal(null)} style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
              Current plan: <strong style={{ color: 'var(--text)' }}>{modal.planSlug}</strong>
            </p>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              Expires: {modal.planExpiresAt ? new Date(modal.planExpiresAt).toLocaleDateString('en-ZA') : '—'}
            </p>

            {/* Set Plan */}
            <div className="mb-4 p-4 rounded-xl" style={{ background: 'var(--surface)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>SET PLAN (admin override)</p>
              <div className="flex gap-2 mb-3">
                {['free', 'pro', 'label'].map(s => (
                  <button key={s} onClick={() => setOverridePlan(s)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors"
                    style={{
                      background: overridePlan === s ? `${PLAN_DEFS[s].color}22` : 'var(--surface2)',
                      border: `1px solid ${overridePlan === s ? PLAN_DEFS[s].color : 'var(--border)'}`,
                      color: overridePlan === s ? PLAN_DEFS[s].color : 'var(--text-muted)',
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              {overridePlan !== 'free' && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Duration:</span>
                  <input type="number" min="1" max="24" value={overrideMonths}
                    onChange={e => setOverrideMonths(e.target.value)}
                    className="w-20 px-3 py-1.5 rounded-lg text-sm text-center"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>months</span>
                </div>
              )}
              <button onClick={() => doAction('set_plan', modal.id)} disabled={actionLoading}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: PLAN_DEFS[overridePlan]?.color || 'var(--sky)' }}>
                {actionLoading ? <VukaLoader size={14} className="inline mr-1" /> : null}
                Set {overridePlan} plan
              </button>
            </div>

            {/* Extend Plan */}
            {modal.planSlug !== 'free' && (
              <div className="mb-4 p-4 rounded-xl" style={{ background: 'var(--surface)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>EXTEND CURRENT PLAN</p>
                <div className="flex items-center gap-2 mb-3">
                  <input type="number" min="1" max="12" value={overrideMonths}
                    onChange={e => setOverrideMonths(e.target.value)}
                    className="w-20 px-3 py-1.5 rounded-lg text-sm text-center"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>months to add</span>
                </div>
                <button onClick={() => doAction('extend_plan', modal.id)} disabled={actionLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'var(--green)' }}>
                  Extend Plan
                </button>
              </div>
            )}

            {/* Cancel Plan */}
            {modal.planSlug !== 'free' && (
              <button onClick={() => { if (confirm('Force-cancel this artist\'s plan immediately?')) doAction('cancel_plan', modal.id); }}
                disabled={actionLoading}
                className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                style={{ border: '1px solid var(--red, #ef4444)', color: 'var(--red, #ef4444)' }}>
                Force-cancel plan (drops to Free now)
              </button>
            )}

            {actionMsg && (
              <p className="mt-3 text-sm text-center font-medium"
                style={{ color: actionMsg === 'Done!' ? 'var(--green)' : 'var(--red, #ef4444)' }}>
                {actionMsg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
