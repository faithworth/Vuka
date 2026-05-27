'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users, Music, Disc, ShoppingBag, TrendingUp, Shield, Flag,
  CheckCircle, XCircle, Clock, AlertTriangle, Music2, LogOut, Loader2
} from 'lucide-react';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '';

type Tab = 'overview' | 'users' | 'content' | 'dmca';

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [dmca, setDmca] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(me => {
      if (!me.email || me.email !== ADMIN_EMAIL) {
        router.replace('/');
        return;
      }
      Promise.all([
        fetch('/api/admin/stats').then(r => r.ok ? r.json() : {}),
        fetch('/api/admin/users').then(r => r.ok ? r.json() : { users: [] }),
        fetch('/api/admin/dmca').then(r => r.ok ? r.json() : { reports: [] }),
      ]).then(([s, u, d]) => {
        setStats(s);
        setUsers(u.users || []);
        setDmca(d.reports || []);
        setLoading(false);
      });
    }).catch(() => router.replace('/'));
  }, [router]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'content', label: 'Content', icon: Music },
    { id: 'dmca', label: 'DMCA', icon: Flag },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sky)' }}>
            <Music2 size={13} className="text-white" />
          </div>
          <span className="font-bold" style={{ color: 'var(--text)' }}>Vuka</span>
          <span className="badge badge-gold">Admin</span>
        </div>
        <Link href="/" className="btn btn-ghost text-sm">← Back to site</Link>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Tab nav */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {TABS.map(t => (
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

        {/* Overview */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Users', value: stats?.totalUsers ?? '—', icon: Users, color: 'var(--sky)' },
                { label: 'Total Sales', value: stats?.totalSales ?? '—', icon: ShoppingBag, color: 'var(--green)' },
                { label: 'Revenue', value: stats?.revenue ? `R${stats.revenue.toFixed(2)}` : '—', icon: TrendingUp, color: 'var(--gold)' },
                { label: 'DMCA Reports', value: dmca.filter(d => d.status === 'pending').length, icon: Flag, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <s.icon size={18} style={{ color: s.color }} className="mb-3" />
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h2 className="font-bold mb-4" style={{ color: 'var(--text)' }}>Quick Actions</h2>
              <div className="flex gap-3 flex-wrap">
                <button onClick={() => setTab('dmca')} className="btn btn-secondary text-sm">
                  <Flag size={14} /> Review DMCA ({dmca.filter(d => d.status === 'pending').length} pending)
                </button>
                <button onClick={() => setTab('users')} className="btn btn-secondary text-sm">
                  <Users size={14} /> Manage Users
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>All Users ({users.length})</h2>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {users.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No users loaded — admin stats API not yet connected.</div>
              ) : users.map((u: any) => (
                <div key={u.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1">
                    <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{u.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                  </div>
                  <span className="badge badge-sky">{u.role}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(u.createdAt).toLocaleDateString('en-ZA')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DMCA */}
        {tab === 'dmca' && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>DMCA Reports</h2>
            {dmca.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <Shield size={32} className="mx-auto mb-3 opacity-40" />
                <p>No DMCA reports</p>
              </div>
            ) : dmca.map((d: any) => (
              <div key={d.id} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold" style={{ color: 'var(--text)' }}>{d.reporterName} — {d.itemTitle}</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{d.claimDescription}</p>
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      {d.reporterEmail} · {new Date(d.createdAt).toLocaleDateString('en-ZA')}
                    </p>
                  </div>
                  <span className="badge" style={{
                    background: d.status === 'resolved' ? 'rgba(16,185,129,0.12)' : d.status === 'dismissed' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
                    color: d.status === 'resolved' ? 'var(--green)' : d.status === 'dismissed' ? '#ef4444' : 'var(--gold)',
                  }}>{d.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
