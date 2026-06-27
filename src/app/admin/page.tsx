'use client';
// ============================================================
// VUKA — Full Admin Dashboard (Phase 5)
// Tabs: Overview · Users · Releases · Finance · Payouts · Settings · Audit
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users, Music, TrendingUp, Shield, Flag, LogOut, Loader2,
  Music2, CheckCircle, XCircle, Clock, AlertTriangle,
  DollarSign, Settings, FileText, RefreshCw, ChevronDown,
  Filter, Search,
} from 'lucide-react';

const ADMIN_EMAIL = ''; // Unused — role check is done via /api/auth/me isAdmin flag

type Tab = 'overview' | 'users' | 'releases' | 'finance' | 'payouts' | 'settings' | 'audit' | 'analytics';

/* ─── small helpers ─────────────────────────────────────────── */
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${color}22`, color }}>
      {label}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  live: '#a0e87c', approved: '#a0e87c', paid: '#a0e87c',
  pending: '#e8c87c', metadata_review: '#e8a87c', artwork_review: '#e8c87c',
  processing: '#38b6e8',
  failed: '#ff4d4d', rejected: '#ff4d4d',
  draft: '#a0a0a0',
};

/* ─── main component ────────────────────────────────────────── */
export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading]  = useState(true);
  const [tab, setTab]          = useState<Tab>('overview');

  // overview
  const [stats, setStats]      = useState<any>(null);
  const [dmca, setDmca]        = useState<any[]>([]);

  // users
  const [users, setUsers]      = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);

  // releases
  const [releases, setReleases]  = useState<any[]>([]);
  const [relStatus, setRelStatus] = useState('active'); // all | active | inactive
  const [relPage, setRelPage]     = useState(1);
  const [relTotal, setRelTotal]   = useState(0);
  const [relCounts, setRelCounts] = useState<{ all: number; active: number; inactive: number }>({ all: 0, active: 0, inactive: 0 });

  // finance
  const [finance, setFinance]  = useState<any>(null);

  // payouts
  const [payouts, setPayouts]       = useState<any[]>([]);
  const [payStatus, setPayStatus]   = useState('pending');
  const [payPage, setPayPage]       = useState(1);
  const [payTotal, setPayTotal]     = useState(0);
  const [paySummary, setPaySummary] = useState<any>(null);

  // settings
  const [settings, setSettings]     = useState<Record<string, any>>({});
  const [settingKey, setSettingKey]  = useState('');
  const [settingVal, setSettingVal]  = useState('');

  // audit
  const [logs, setLogs]       = useState<any[]>([]);
  const [logCat, setLogCat]   = useState('all');
  const [logQ, setLogQ]       = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);

  const [actionNote, setActionNote]  = useState('');
  const [actionRef, setActionRef]    = useState('');
  const [working, setWorking]        = useState(false);

  /* ── auth gate ─────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((me) => {
        // isAdmin is true for owner/super_admin/admin/moderator — set by /api/auth/me from DB
        if (!me.isAdmin) { router.replace('/'); return; }
        loadOverview();
        setLoading(false);
      })
      .catch(() => router.replace('/'));
  }, [router]);

  /* ── data loaders ──────────────────────────────────────────── */
  function loadOverview() {
    Promise.all([
      fetch('/api/admin/stats').then((r) => r.ok ? r.json() : {}),
      fetch('/api/admin/dmca').then((r) => r.ok ? r.json() : { reports: [] }),
    ]).then(([s, d]) => { setStats(s); setDmca(d.reports || []); });
  }

  const loadUsers = useCallback(() => {
    fetch(`/api/admin/users-manage?q=${encodeURIComponent(userSearch)}&page=${userPage}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setUsers(d.users || []); setUserTotal(d.total || 0); } });
  }, [userSearch, userPage]);

  const loadReleases = useCallback(() => {
    fetch(`/api/admin/releases?status=${relStatus}&page=${relPage}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setReleases(d.releases || []);
          setRelTotal(d.total || 0);
          setRelCounts(d.counts || { all: 0, active: 0, inactive: 0 });
        }
      });
  }, [relStatus, relPage]);

  function loadFinance() {
    fetch('/api/admin/finance').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setFinance(d); });
  }

  const loadPayouts = useCallback(() => {
    fetch(`/api/admin/payouts?status=${payStatus}&page=${payPage}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setPayouts(d.requests || []);
          setPayTotal(d.total || 0);
          setPaySummary(d.summary);
        }
      });
  }, [payStatus, payPage]);

  function loadSettings() {
    fetch('/api/admin/settings').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSettings(d.settings || {}); });
  }

  const loadAudit = useCallback(() => {
    fetch(`/api/admin/audit?category=${logCat}&q=${encodeURIComponent(logQ)}&page=${logPage}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setLogs(d.logs || []); setLogTotal(d.total || 0); } });
  }, [logCat, logQ, logPage]);

  useEffect(() => { if (tab === 'users')    loadUsers();    }, [tab, loadUsers]);
  useEffect(() => { if (tab === 'releases') loadReleases(); }, [tab, loadReleases]);
  useEffect(() => { if (tab === 'finance')  loadFinance();  }, [tab]);
  useEffect(() => { if (tab === 'payouts')  loadPayouts();  }, [tab, loadPayouts]);
  useEffect(() => { if (tab === 'settings') loadSettings(); }, [tab]);
  useEffect(() => { if (tab === 'audit')    loadAudit();    }, [tab, loadAudit]);

  /* ── admin actions ─────────────────────────────────────────── */
  async function releaseAction(releaseId: string, action: 'activate' | 'deactivate' | 'delete') {
    if (action === 'deactivate' && !actionNote.trim()) {
      alert('Add a reason in the note field before unpublishing — it\'s sent to the artist.');
      return;
    }
    if (action === 'delete' && !confirm('Permanently delete this release? This cannot be undone.')) return;
    setWorking(true);
    const r = await fetch('/api/admin/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ releaseId, action, notes: actionNote }),
    });
    setWorking(false);
    if (r.ok) { setActionNote(''); loadReleases(); }
    else { const d = await r.json().catch(() => ({})); alert(d.error || 'Action failed'); }
  }

  async function payoutAction(requestId: string, action: string) {
    setWorking(true);
    const r = await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action, notes: actionNote, reference: actionRef }),
    });
    setWorking(false);
    if (r.ok) { setActionNote(''); setActionRef(''); loadPayouts(); }
    else alert('Action failed');
  }

  async function userAction(userId: string, action: string, value?: string) {
    setWorking(true);
    const r = await fetch('/api/admin/users-manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, value, reason: actionNote }),
    });
    setWorking(false);
    if (r.ok) { setActionNote(''); loadUsers(); }
    else alert('Action failed');
  }

  async function saveSetting() {
    if (!settingKey) return;
    let parsed: any = settingVal;
    if (settingVal === 'true')  parsed = true;
    else if (settingVal === 'false') parsed = false;
    else if (!isNaN(Number(settingVal))) parsed = Number(settingVal);

    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, value: parsed }),
    });
    if (r.ok) { loadSettings(); setSettingKey(''); setSettingVal(''); }
  }

  /* ── early exits ───────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview',  label: 'Overview',  icon: TrendingUp  },
    { id: 'users',     label: 'Users',     icon: Users       },
    { id: 'releases',  label: 'Releases',  icon: Music       },
    { id: 'finance',   label: 'Finance',   icon: DollarSign  },
    { id: 'payouts',   label: 'Payouts',   icon: DollarSign  },
    { id: 'settings',  label: 'Settings',  icon: Settings    },
    { id: 'audit',     label: 'Audit',     icon: Shield      },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp  },
  ];

  const surface = { background: 'var(--surface)', border: '1px solid var(--border)' };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sky)' }}>
            <Music2 size={13} className="text-white" />
          </div>
          <span className="font-bold" style={{ color: 'var(--text)' }}>Vuka</span>
          <Badge label="Admin" color="#e8c87c" />
        </div>
        <Link href="/" className="btn btn-ghost text-sm">← Back to site</Link>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tab nav */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit flex-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: tab === t.id ? 'var(--sky)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--text-muted)',
              }}>
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Users',   value: stats?.totalUsers ?? '—',   icon: Users,       color: 'var(--sky)'  },
                { label: 'Total Sales',   value: stats?.totalSales ?? '—',   icon: Music,       color: 'var(--green)'},
                { label: 'Revenue',       value: stats?.revenue ? `R${stats.revenue.toFixed(2)}` : '—', icon: TrendingUp, color: '#e8c87c' },
                { label: 'Open DMCA',     value: dmca.filter((d: any) => d.status === 'pending').length, icon: Flag, color: '#ff4d4d' },
              ].map((s) => (
                <div key={s.label} className="p-5 rounded-2xl" style={surface}>
                  <s.icon size={18} style={{ color: s.color }} className="mb-3" />
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* DMCA table */}
            {dmca.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={surface}>
                <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                    <Flag size={14} className="inline mr-2" style={{ color: '#ff4d4d' }} />
                    DMCA Reports
                  </h3>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {dmca.slice(0, 10).map((d: any) => (
                    <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{d.itemTitle || d.id}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.claimantEmail}</p>
                      </div>
                      <Badge label={d.status} color={STATUS_COLORS[d.status] || '#a0a0a0'} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input className="input pl-9 w-full text-sm" placeholder="Search users…"
                  value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadUsers()} />
              </div>
              <button className="btn btn-primary text-sm" onClick={loadUsers}>Search</button>
            </div>

            <div className="rounded-2xl overflow-hidden" style={surface}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {['Name', 'Email', 'Role', 'Joined', 'Purchases', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <span className="font-medium" style={{ color: 'var(--text)' }}>{u.name}</span>
                        {u.isSuspended && <Badge label="suspended" color="#ff4d4d" />}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                      <td className="px-4 py-3"><Badge label={u.role} color="var(--sky)" /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{u._count?.purchases ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          {u.isSuspended
                            ? <button className="btn btn-ghost text-xs py-1 px-2" style={{ color: '#a0e87c' }}
                                onClick={() => userAction(u.id, 'unsuspend')}>Unsuspend</button>
                            : <button className="btn btn-ghost text-xs py-1 px-2" style={{ color: '#ff4d4d' }}
                                onClick={() => userAction(u.id, 'suspend')}>Suspend</button>
                          }
                          {u.artist && !u.artist.isVerified && (
                            <button className="btn btn-ghost text-xs py-1 px-2" style={{ color: '#e8c87c' }}
                              onClick={() => userAction(u.id, 'verify')}>Verify</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {userTotal} users total · Page {userPage}
              <button className="ml-3 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setUserPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
              <button className="ml-1 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setUserPage((p) => p + 1)}>Next ›</button>
            </p>
          </div>
        )}

        {/* ── RELEASES ── */}
        {tab === 'releases' && (
          <div className="space-y-4">
            {/* Status filter tabs */}
            <div className="flex gap-1 flex-wrap">
              {(['active', 'inactive', 'all'] as const).map((s) => {
                const cnt = relCounts[s] ?? 0;
                const labels: Record<string, string> = { active: 'Live', inactive: 'Unpublished', all: 'All' };
                return (
                  <button key={s}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: relStatus === s ? 'var(--sky)' : 'var(--surface)',
                      color: relStatus === s ? 'white' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => { setRelStatus(s); setRelPage(1); }}>
                    {labels[s]} {cnt > 0 && `(${cnt})`}
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl overflow-hidden" style={surface}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {['Title', 'Artist', 'Type', 'Tracks', 'Status', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {releases.map((rel: any) => (
                    <tr key={rel.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{rel.title}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                        {rel.artist?.name}
                        {rel.artist?.isVerified && <CheckCircle size={12} className="inline ml-1" style={{ color: '#a0e87c' }} />}
                      </td>
                      <td className="px-4 py-3"><Badge label={rel.releaseType} color="var(--sky)" /></td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{rel._count?.tracks}</td>
                      <td className="px-4 py-3">
                        <Badge label={rel.isActive ? 'live' : 'unpublished'} color={rel.isActive ? '#a0e87c' : '#ff4d4d'} />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {rel.createdAt ? new Date(rel.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {rel.isActive ? (
                            <button className="btn btn-ghost text-xs py-0.5 px-2" style={{ color: '#ff4d4d' }}
                              onClick={() => releaseAction(rel.id, 'deactivate')}>Unpublish</button>
                          ) : (
                            <>
                              <button className="btn btn-ghost text-xs py-0.5 px-2" style={{ color: '#a0e87c' }}
                                onClick={() => releaseAction(rel.id, 'activate')}>Republish</button>
                              {!rel.sales && (
                                <button className="btn btn-ghost text-xs py-0.5 px-2" style={{ color: '#ff4d4d' }}
                                  onClick={() => releaseAction(rel.id, 'delete')}>Delete</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Optional admin notes input — required when unpublishing */}
            <div className="flex gap-3">
              <input className="input flex-1 text-sm" placeholder="Reason (required to unpublish, sent to the artist)…"
                value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {relTotal} total · Page {relPage}
              <button className="ml-3 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setRelPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
              <button className="ml-1 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setRelPage((p) => p + 1)}>Next ›</button>
            </p>
          </div>
        )}

        {/* ── FINANCE ── */}
        {tab === 'finance' && (
          <div className="space-y-6">
            {!finance ? (
              <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--sky)' }} /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Lifetime Revenue',  value: `R${(finance.revenue?.lifetime || 0).toFixed(2)}`,    color: '#e8c87c' },
                    { label: 'Platform Fees',      value: `R${(finance.revenue?.platformFee || 0).toFixed(2)}`, color: '#a0e87c' },
                    { label: 'This Month',         value: `R${(finance.revenue?.thisMonth || 0).toFixed(2)}`,   color: 'var(--sky)' },
                    { label: 'Total Paid Out',     value: `R${(finance.payouts?.totalPaid || 0).toFixed(2)}`,   color: '#e8a87c' },
                  ].map((s) => (
                    <div key={s.label} className="p-5 rounded-2xl" style={surface}>
                      <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl overflow-hidden" style={surface}>
                  <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Top Earning Artists</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th className="px-4 py-3 text-left text-xs">Artist</th>
                        <th className="px-4 py-3 text-left text-xs">Net Earned</th>
                        <th className="px-4 py-3 text-left text-xs">Platform Fees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(finance.topArtists || []).map((a: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>
                            {a.artist?.name || a.artistId?.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3" style={{ color: '#a0e87c' }}>R{(a._sum?.netAmount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3" style={{ color: '#e8c87c' }}>R{(a._sum?.platformFee || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl overflow-hidden" style={surface}>
                  <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Sales by Type (last 90 days)</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th className="px-4 py-3 text-left text-xs">Type</th>
                        <th className="px-4 py-3 text-left text-xs">Count</th>
                        <th className="px-4 py-3 text-left text-xs">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(finance.salesByType || []).map((s: any) => (
                        <tr key={s.itemType} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-4 py-3 font-medium capitalize" style={{ color: 'var(--text)' }}>{s.itemType}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{s._count}</td>
                          <td className="px-4 py-3" style={{ color: '#a0e87c' }}>R{(s._sum?.amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── PAYOUTS ── */}
        {tab === 'payouts' && (
          <div className="space-y-4">
            {paySummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl" style={surface}>
                  <p className="text-xl font-black" style={{ color: '#e8c87c' }}>R{paySummary.pendingAmount?.toFixed(2)}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending ({paySummary.pendingCount})</p>
                </div>
                <div className="p-4 rounded-xl" style={surface}>
                  <p className="text-xl font-black" style={{ color: '#a0e87c' }}>R{paySummary.paidAmount?.toFixed(2)}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Paid ({paySummary.paidCount})</p>
                </div>
              </div>
            )}

            <div className="flex gap-1 flex-wrap">
              {['pending', 'approved', 'paid', 'rejected', 'all'].map((s) => (
                <button key={s}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: payStatus === s ? 'var(--sky)' : 'var(--surface)',
                    color: payStatus === s ? 'white' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                  onClick={() => { setPayStatus(s); setPayPage(1); }}>
                  {s}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <input className="input flex-1 text-sm" placeholder="Admin note…"
                value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
              <input className="input w-40 text-sm" placeholder="Reference #"
                value={actionRef} onChange={(e) => setActionRef(e.target.value)} />
            </div>

            <div className="rounded-2xl overflow-hidden" style={surface}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {['Artist', 'Email', 'Amount', 'Bank', 'Status', 'Requested', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p: any) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{p.artist?.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{p.artist?.user?.email}</td>
                      <td className="px-4 py-3 font-black" style={{ color: '#a0e87c' }}>R{p.amount?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {p.bankAccount ? `${p.bankAccount.bankName} ${p.bankAccount.maskedNumber}` : '—'}
                      </td>
                      <td className="px-4 py-3"><Badge label={p.status} color={STATUS_COLORS[p.status] || '#a0a0a0'} /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {p.status === 'pending' && (
                            <button className="btn btn-ghost text-xs py-0.5 px-2" style={{ color: '#a0e87c' }}
                              onClick={() => payoutAction(p.id, 'approve')}>Approve</button>
                          )}
                          {p.status === 'approved' && (
                            <button className="btn btn-ghost text-xs py-0.5 px-2" style={{ color: 'var(--sky)' }}
                              onClick={() => payoutAction(p.id, 'mark_paid')}>Mark Paid</button>
                          )}
                          {['pending', 'approved'].includes(p.status) && (
                            <button className="btn btn-ghost text-xs py-0.5 px-2" style={{ color: '#ff4d4d' }}
                              onClick={() => payoutAction(p.id, 'reject')}>Reject</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {payTotal} total · Page {payPage}
              <button className="ml-3 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setPayPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
              <button className="ml-1 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setPayPage((p) => p + 1)}>Next ›</button>
            </p>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div className="space-y-6 max-w-2xl">
            <div className="rounded-2xl overflow-hidden" style={surface}>
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Platform Settings</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Click a row to edit inline, or use the form below.
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {Object.entries(settings).map(([k, v]) => (
                  <div key={k} className="px-5 py-3 flex items-center justify-between gap-4">
                    <code className="text-xs font-mono" style={{ color: 'var(--sky)' }}>{k}</code>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {String(v)}
                    </span>
                    <button className="btn btn-ghost text-xs py-0.5 px-2 ml-auto"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => { setSettingKey(k); setSettingVal(String(v)); }}>
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl space-y-3" style={surface}>
              <h4 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Update / Add Setting</h4>
              <input className="input w-full text-sm" placeholder="key (e.g. min_payout_zar)"
                value={settingKey} onChange={(e) => setSettingKey(e.target.value)} />
              <input className="input w-full text-sm" placeholder="value (e.g. 150 or true)"
                value={settingVal} onChange={(e) => setSettingVal(e.target.value)} />
              <button className="btn btn-primary text-sm" onClick={saveSetting}>Save Setting</button>
            </div>
          </div>
        )}

        {/* ── AUDIT ── */}
        {tab === 'audit' && (
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <select className="input text-sm w-44"
                value={logCat} onChange={(e) => setLogCat(e.target.value)}>
                {['all', 'auth', 'payment', 'content', 'moderation', 'admin', 'security', 'distribution'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input className="input flex-1 min-w-48 text-sm" placeholder="Search logs…"
                value={logQ} onChange={(e) => setLogQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAudit()} />
              <button className="btn btn-primary text-sm" onClick={loadAudit}>Search</button>
            </div>

            <div className="rounded-2xl overflow-hidden" style={surface}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {['Action', 'Target', 'Notes', 'When'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l: any) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <code className="text-xs" style={{ color: 'var(--sky)' }}>{l.action}</code>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {l.targetType} {l.targetId?.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {l.notes}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {logTotal} entries · Page {logPage}
              <button className="ml-3 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setLogPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
              <button className="ml-1 btn btn-ghost text-xs py-0.5 px-2" onClick={() => setLogPage((p) => p + 1)}>Next ›</button>
            </p>
          </div>
        )}

        {tab === 'analytics' && <AdminAnalyticsTab />}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PHASE 10 — Admin Analytics Tab (appended, no existing code touched)
// Shows platform-level stats: funnel, top artists, revenue overview.
// ─────────────────────────────────────────────────────────────

function AdminAnalyticsTab() {
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<any>(null);
  const [funnel, setFunnel] = useState<any[]>([]);
  const [topArtists, setTopArtists] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics/platform').then(r => r.ok ? r.json() : null),
      fetch('/api/analytics/funnel').then(r => r.ok ? r.json() : null),
    ]).then(([pl, fn]) => {
      if (pl) setPlatform(pl);
      if (fn) { setFunnel(fn.funnel ?? []); setTopArtists(fn.topArtists ?? []); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, color: 'var(--text-muted)' }}>
      <Loader2 size={18} className="animate-spin" /> Loading analytics…
    </div>
  );

  const totals = platform?.totals;
  const revenue = platform?.revenue;
  const maxFunnel = funnel[0]?.count || 1;

  return (
    <div style={{ padding: '20px 0' }}>
      {/* KPI strip */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Users',     value: totals.users,          color: 'var(--sky)'  },
            { label: 'Active Artists',  value: totals.artists,        color: 'var(--gold)' },
            { label: 'New (30d)',        value: totals.newUsersMonth,  color: 'var(--green)'},
            { label: 'Beats Live',       value: totals.beats,          color: 'var(--sky)'  },
            { label: 'Releases Live',    value: totals.releases,       color: 'var(--gold)' },
            { label: 'Rev (30d)',        value: `R${(revenue?.monthly ?? 0).toLocaleString()}`, color: 'var(--green)' },
            { label: 'Rev (All-time)',   value: `R${(revenue?.total ?? 0).toLocaleString()}`,   color: 'var(--gold)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 16px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: 'IBM Plex Mono, monospace' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Conversion Funnel */}
        {funnel.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Conversion Funnel</p>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {funnel.map((step, i) => {
                const pct = (step.count / maxFunnel) * 100;
                const conv = i > 0 && funnel[i - 1].count > 0
                  ? ((step.count / funnel[i - 1].count) * 100).toFixed(0)
                  : null;
                return (
                  <div key={step.stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: 'var(--text)' }}>{step.stage}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {conv && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>↓ {conv}%</span>}
                        <span style={{ fontWeight: 700, color: 'var(--sky)', fontFamily: 'monospace' }}>
                          {step.count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--surface2)' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: 'var(--sky)', width: `${pct}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Artists */}
        {topArtists.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Top Artists by Plays</p>
            </div>
            <div style={{ padding: '8px 0' }}>
              {topArtists.slice(0, 10).map((a: any, i: number) => {
                const maxPlays = topArtists[0]?.totalPlays || 1;
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 16, textAlign: 'right' }}>{i + 1}</span>
                    {a.photoUrl && (
                      <img src={a.photoUrl} alt={a.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                      <div style={{ height: 3, borderRadius: 2, background: 'var(--surface2)', marginTop: 3 }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'var(--sky)', width: `${(a.totalPlays / maxPlays) * 100}%` }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--sky)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {a.totalPlays.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent platform purchases */}
      {platform?.recentPurchases?.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Recent Platform Transactions</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Buyer', 'Item', 'Amount', 'Currency', 'Date'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platform.recentPurchases.slice(0, 15).map((p: any) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 16px', color: 'var(--text)' }}>{p.buyerName || p.buyerEmail || '—'}</td>
                  <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.itemType || 'purchase'}</td>
                  <td style={{ padding: '9px 16px', color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 600 }}>{p.amount}</td>
                  <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.currency || 'ZAR'}</td>
                  <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>
                    {new Date(p.createdAt).toLocaleDateString('en-ZA')}
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
