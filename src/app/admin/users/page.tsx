'use client';
// ============================================================
// VUKA — Admin Users Management (Phase 5)
// /admin/users — full user management: view, edit role,
// verify, suspend, adjust balance, impersonate, delete.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import {
  Search, Filter, RefreshCw, Shield, ShieldOff, UserCheck, UserX, ChevronDown, ExternalLink, Edit2, Trash2, AlertTriangle, CheckCircle, XCircle, Eye, Mail, DollarSign,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

const ROLES = ['ALL', 'artist', 'producer', 'fan', 'industry', 'admin'];
const STATUS = ['ALL', 'ACTIVE', 'SUSPENDED', 'UNVERIFIED'];

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${color}22`, color }}>
      {label}
    </span>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers]         = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [roleFilter, setRole]     = useState('ALL');
  const [statusFilter, setStatus] = useState('ALL');
  const [selected, setSelected]   = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [balanceAmt, setBalanceAmt] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [page, setPage] = useState(1);

  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        q: search,
        role: roleFilter === 'ALL' ? 'all' : roleFilter,
        page: String(page),
      });
      // /api/admin/users is the proven-working route; now upgraded to return artist data
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally { setLoading(false); }
  }, [search, roleFilter, page]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, userId: string, extra?: Record<string, any>) {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/users-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId, ...extra }),
      });
      if (res.ok) { await load(); setSelected(null); }
      else { const d = await res.json(); alert(d.error || 'Action failed'); }
    } finally { setActionLoading(false); }
  }

  // Client-side status filter (server handles role/search)
  const filtered = users.filter(u => {
    if (statusFilter === 'SUSPENDED' && !u.isSuspended) return false;
    if (statusFilter === 'ACTIVE' && u.isSuspended) return false;
    if (statusFilter === 'UNVERIFIED' && u.artist?.isVerified) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-display">Users</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} registered users</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {loading ? <VukaLoader size={14} /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
        <select value={roleFilter} onChange={e => setRole(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {STATUS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', color: '#ff4d4d' }}>
          Failed to load users: {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Artist', 'Email', 'Role', 'Plan', 'Status', 'Verified', 'Purchases', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center">
                  <VukaLoader size={20} className="mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No users found</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id} className="border-t hover:bg-white/[0.02] transition-colors"
                  style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                        : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: 'var(--surface)', color: 'var(--green)' }}>
                            {u.name?.[0]?.toUpperCase() || '?'}
                          </div>
                      }
                      <span className="font-medium">{u.name || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge label={u.role || 'fan'}
                      color={u.role === 'admin' || u.role === 'owner' ? '#e8c87c' : u.role === 'industry' ? '#38b6e8' : u.role === 'artist' || u.role === 'producer' ? 'var(--green)' : 'var(--text-muted)'} />
                  </td>
                  <td className="px-4 py-3">
                    {u.artist?.planSlug
                      ? <Badge label={u.artist.planSlug.toUpperCase()}
                          color={u.artist.planSlug === 'label' ? '#f59e0b' : u.artist.planSlug === 'pro' ? '#38bdf8' : 'var(--text-muted)'} />
                      : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={u.isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                      color={u.isSuspended ? '#ff4d4d' : 'var(--green)'} />
                  </td>
                  <td className="px-4 py-3">
                    {u.artist?.isVerified
                      ? <CheckCircle size={14} style={{ color: 'var(--green)' }} />
                      : <XCircle size={14} style={{ color: 'var(--text-muted)' }} />}
                  </td>
                  <td className="px-4 py-3">{u._count?.purchases ?? 0}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(u)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
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

      {/* User detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-2xl p-6 my-4 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-lg">{selected.name}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.email}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-sm" style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Artist profile info */}
            {selected.artist ? (
              <div className="px-3 py-2.5 rounded-xl text-sm flex items-center justify-between"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Plan:</span>
                <strong style={{ color: selected.artist.planSlug === 'label' ? '#f59e0b' : selected.artist.planSlug === 'pro' ? '#38bdf8' : 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {selected.artist.planSlug || 'free'}
                </strong>
              </div>
            ) : (
              <div className="px-3 py-2.5 rounded-xl text-xs"
                style={{ background: 'rgba(232,168,124,0.08)', border: '1px solid rgba(232,168,124,0.2)', color: '#e8a87c' }}>
                ⚠ No artist profile — user registered but didn&apos;t complete artist setup. Verify and Set Plan are unavailable until they do.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Verify: uses artist.isVerified, not user.isVerified (User model has no isVerified field) */}
              <button
                onClick={() => doAction(selected.artist?.isVerified ? 'unverify' : 'verify', selected.id)}
                disabled={actionLoading || !selected.artist}
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)' }}>
                <UserCheck size={14} /> {selected.artist?.isVerified ? 'Unverify' : 'Verify'}
              </button>
              <button onClick={() => {
                const reason = prompt('Suspension reason:') || '';
                doAction(selected.isSuspended ? 'unsuspend' : 'suspend', selected.id, { reason });
              }}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2"
                style={{ background: selected.isSuspended ? 'rgba(160,232,124,0.1)' : 'rgba(255,77,77,0.1)',
                  color: selected.isSuspended ? 'var(--green)' : '#ff4d4d' }}>
                {selected.isSuspended ? <ShieldOff size={14} /> : <Shield size={14} />}
                {selected.isSuspended ? 'Unsuspend' : 'Suspend'}
              </button>
              <button onClick={() => {
                const amt = prompt('Balance adjustment (e.g. +500 or -100):') || '';
                if (amt) doAction('adjust_balance', selected.id, { amount: parseFloat(amt) });
              }}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2"
                style={{ background: 'rgba(232,200,124,0.1)', color: 'var(--gold)' }}>
                <DollarSign size={14} /> Adjust Balance
              </button>
              <button onClick={() => {
                if (!selected.artist) { alert('User has no artist profile yet.'); return; }
                const plan = prompt('Set plan (free / pro / label):')?.toLowerCase().trim();
                if (plan && ['free','pro','label'].includes(plan))
                  doAction('set_plan', selected.id, { value: plan });
                else if (plan) alert('Must be: free, pro, or label');
              }}
                disabled={actionLoading || !selected.artist}
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(56,189,248,0.1)', color: 'var(--sky)' }}>
                <Edit2 size={14} /> Set Plan
              </button>
              {selected.artist?.slug && (
                <a href={`/artists/${selected.artist.slug}`} target="_blank" rel="noopener"
                  className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <Eye size={14} /> View Profile
                </a>
              )}
            </div>

            <button onClick={() => {
              if (confirm(`Delete ${selected.name}? This is irreversible.`))
                doAction('delete', selected.id);
            }}
              disabled={actionLoading}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.2)' }}>
              <Trash2 size={14} /> Delete Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
